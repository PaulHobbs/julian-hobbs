<script lang="ts">
	import type { GameState, Player, AIDifficulty, CardColor, HouseRules, NetworkMessage } from '$lib/uno/types';
	import { createDeck, shuffleDeck, dealHands, findStartCard } from '$lib/uno/deck';
	import { DEFAULT_HOUSE_RULES, DEFAULT_TARGET_SCORE, AI_NAMES } from '$lib/uno/constants';
	import { calculateRoundScore, applyRoundScores, createRoundResult, checkGameEnd } from '$lib/uno/scoring';
	import { MultiplayerManager } from '$lib/uno/multiplayer';
	import type { LobbyPlayer } from '$lib/uno/multiplayer';
	import { processPlayerAction } from '$lib/uno/actions';
	import UnoGame from './UnoGame.svelte';
	import UnoOnlineLobby from './UnoOnlineLobby.svelte';

	type Phase = 'menu' | 'setup' | 'online_setup' | 'online_lobby' | 'playing' | 'round_end' | 'game_end';

	let phase: Phase = $state('menu');
	let playerName: string = $state('Player');
	let aiCount: number = $state(1);
	let aiDifficulty: AIDifficulty = $state('medium');
	let houseRules: HouseRules = $state({ ...DEFAULT_HOUSE_RULES });
	let targetScore: number = $state(DEFAULT_TARGET_SCORE);
	let gameState: GameState | null = $state(null);
	let localPlayerId: string = $state('local-player');
	let roundWinnerId: string = $state('');
	let roundScores: Record<string, number> = $state({});
	let gameWinnerId: string = $state('');

	// Multiplayer state
	let multiplayer: MultiplayerManager | null = $state(null);
	let isMultiplayerHost: boolean = $state(false);
	let lobbyPlayers: LobbyPlayer[] = $state([]);
	let myOnlinePlayerId: string = $state('');
	let onlineError: string = $state('');
	let roomCodeInput: string = $state('');
	let isConnecting: boolean = $state(false);
	let hostDisconnected: boolean = $state(false);

	function startGame() {
		const players: Player[] = [
			{
				id: localPlayerId,
				name: playerName || 'Player',
				type: 'human',
				hand: [],
				score: 0,
				calledUno: false,
				isConnected: true
			}
		];

		for (let i = 0; i < aiCount; i++) {
			players.push({
				id: `ai-${i}`,
				name: AI_NAMES[i],
				type: 'ai',
				aiDifficulty,
				hand: [],
				score: 0,
				calledUno: false,
				isConnected: true
			});
		}

		startRound(players);
	}

	function startRound(players: Player[]) {
		const deck = shuffleDeck(createDeck());
		const { hands, remaining } = dealHands(deck, players.length);
		const { startCard, remaining: drawPile } = findStartCard(remaining);

		const playersWithHands = players.map((p, i) => ({
			...p,
			hand: hands[i],
			calledUno: false
		}));

		const activeColor = startCard.color as CardColor;

		gameState = {
			phase: 'playing',
			players: playersWithHands,
			currentPlayerIndex: 0,
			direction: 1,
			drawPile,
			discardPile: [startCard],
			activeColor,
			pendingDraw: 0,
			mustCallUno: null,
			awaitingColorChoice: false,
			colorChooserPlayerId: null,
			unoWindowOpen: false,
			unoWindowTargetId: null,
			houseRules: { ...houseRules },
			roundNumber: (gameState?.roundNumber ?? 0) + 1,
			targetScore,
			roundHistory: gameState?.roundHistory ?? [],
			hasDrawnThisTurn: false,
			drawnCard: null,
			log: [`Round ${(gameState?.roundNumber ?? 0) + 1} begins!`]
		};

		phase = 'playing';
	}

	function handleStateChange(newState: GameState) {
		gameState = newState;
		// Host broadcasts state to all guests after every change
		if (isMultiplayerHost && multiplayer) {
			multiplayer.broadcastState(newState);
		}
	}

	function handleRoundEnd(winnerId: string, finalState: GameState) {
		roundWinnerId = winnerId;
		roundScores = calculateRoundScore(finalState.players, winnerId);

		const updatedPlayers = applyRoundScores(finalState.players, roundScores);
		const roundResult = createRoundResult(finalState.roundNumber, winnerId, roundScores);

		const newGameState: GameState = {
			...finalState,
			players: updatedPlayers,
			roundHistory: [...finalState.roundHistory, roundResult],
			phase: 'round_end'
		};

		gameState = newGameState;

		// Host broadcasts round_end with scored state to guests
		if (isMultiplayerHost && multiplayer) {
			multiplayer.broadcastRoundEnd(winnerId, newGameState);
		}

		const gameWinner = checkGameEnd(updatedPlayers, targetScore);
		if (gameWinner) {
			gameWinnerId = gameWinner;
			phase = 'game_end';
		} else {
			phase = 'round_end';
		}
	}

	function nextRound() {
		if (!gameState) return;
		const players = gameState.players.map((p) => ({ ...p, hand: [], calledUno: false }));
		startRound(players);
		// Broadcast new round state to guests
		if (isMultiplayerHost && multiplayer && gameState) {
			multiplayer.broadcastState(gameState);
		}
	}

	function backToMenu() {
		multiplayer?.destroy();
		multiplayer = null;
		isMultiplayerHost = false;
		lobbyPlayers = [];
		myOnlinePlayerId = '';
		onlineError = '';
		roomCodeInput = '';
		isConnecting = false;
		hostDisconnected = false;
		phase = 'menu';
		gameState = null;
	}

	function getPlayerName(id: string): string {
		return gameState?.players.find((p) => p.id === id)?.name ?? '';
	}

	let roundWinnerName = $derived(getPlayerName(roundWinnerId));
	let gameWinnerName = $derived(getPlayerName(gameWinnerId));

	// --- Multiplayer handlers ---

	async function handleCreateRoom() {
		onlineError = '';
		isConnecting = true;
		try {
			const mp = await MultiplayerManager.createRoom({
				onPlayerJoined(peerId, name) {
					// Add to lobby
					const updatedPlayers = [...lobbyPlayers, { id: peerId, name }];
					lobbyPlayers = updatedPlayers;
					// Tell all existing guests about the new player
					mp.broadcastPlayerJoined(peerId, name);
					// Send full roster to the new guest so they see everyone
					mp.sendRosterToPeer(peerId, updatedPlayers);
				},
				onPlayerLeft(peerId) {
					lobbyPlayers = lobbyPlayers.filter((p) => p.id !== peerId);
					if (gameState) {
						const newPlayers = gameState.players.map((p) =>
							p.id === peerId ? { ...p, isConnected: false } : p
						);
						handleStateChange({ ...gameState, players: newPlayers });
					}
				},
				onRemoteAction(peerId, msg) {
					if (!gameState) return;
					const result = processPlayerAction(gameState, peerId, msg);
					if (!result) return;
					if (result.type === 'state_change') {
						handleStateChange(result.state);
					} else if (result.type === 'round_end') {
						handleRoundEnd(result.winnerId, result.state);
					}
				},
				onError(error) {
					onlineError = error;
				}
			});

			multiplayer = mp;
			isMultiplayerHost = true;
			myOnlinePlayerId = mp.myPlayerId;
			localPlayerId = mp.myPlayerId;

			// Add host as first lobby player
			lobbyPlayers = [{ id: mp.myPlayerId, name: playerName || 'Player' }];
			phase = 'online_lobby';
		} catch (e) {
			onlineError = e instanceof Error ? e.message : 'Failed to create room';
		} finally {
			isConnecting = false;
		}
	}

	async function handleJoinRoom() {
		const code = roomCodeInput.trim().toUpperCase();
		if (!code || code.length !== 6) {
			onlineError = 'Enter a valid 6-character room code';
			return;
		}
		onlineError = '';
		isConnecting = true;
		try {
			const { manager, playerId } = await MultiplayerManager.joinRoom(
				code,
				playerName || 'Player',
				{
					onStateUpdate(state) {
						gameState = state;
						// Sync phase from received state
						if (state.phase === 'playing') {
							phase = 'playing';
						}
					},
					onRoundEndReceived(winnerId, state) {
						roundWinnerId = winnerId;
						gameState = state;
						const lastRound = state.roundHistory[state.roundHistory.length - 1];
						roundScores = lastRound?.scores ?? {};
						const gameWinner = checkGameEnd(state.players, state.targetScore);
						if (gameWinner) {
							gameWinnerId = gameWinner;
							phase = 'game_end';
						} else {
							phase = 'round_end';
						}
					},
					onPlayerJoined(peerId, name) {
						if (!lobbyPlayers.find((p) => p.id === peerId)) {
							lobbyPlayers = [...lobbyPlayers, { id: peerId, name }];
						}
					},
					onPlayerLeft(peerId) {
						lobbyPlayers = lobbyPlayers.filter((p) => p.id !== peerId);
						// Check if the host disconnected
						if (peerId === `uno-${roomCodeInput.toUpperCase().trim()}`) {
							hostDisconnected = true;
						}
					},
					onError(error) {
						onlineError = error;
					}
				}
			);

			multiplayer = manager;
			isMultiplayerHost = false;
			myOnlinePlayerId = playerId;
			localPlayerId = playerId;

			// We'll receive the full player list via player_joined events from host
			// Add ourselves as a starting point (host will have added us)
			lobbyPlayers = [{ id: playerId, name: playerName || 'Player' }];
			phase = 'online_lobby';
		} catch (e) {
			onlineError = e instanceof Error ? e.message : 'Failed to join room. Check the code and try again.';
		} finally {
			isConnecting = false;
		}
	}

	function handleStartOnlineGame() {
		if (!isMultiplayerHost || lobbyPlayers.length < 2) return;

		const players: Player[] = lobbyPlayers.map((lp) => ({
			id: lp.id,
			name: lp.name,
			type: 'human',
			hand: [],
			score: 0,
			calledUno: false,
			isConnected: true
		}));

		startRound(players);

		// Broadcast initial state to all guests
		if (multiplayer && gameState) {
			multiplayer.broadcastState(gameState);
		}
	}

	function handleMultiplayerAction(msg: NetworkMessage) {
		multiplayer?.sendAction(msg);
	}
</script>

<svelte:head>
	<title>UNO</title>
</svelte:head>

<div class="uno-app">
	{#if phase === 'menu'}
		<div class="menu">
			<h1 class="title">UNO</h1>
			<button class="menu-btn primary" onclick={() => phase = 'setup'}>
				Play vs AI
			</button>
			<button class="menu-btn" onclick={() => phase = 'online_setup'}>
				Online Multiplayer
			</button>
			<a href="/" class="back-link">Back to Home</a>
		</div>

	{:else if phase === 'setup'}
		<div class="setup">
			<h2>Game Setup</h2>

			<div class="form-group">
				<label for="name">Your Name</label>
				<input id="name" type="text" bind:value={playerName} maxlength={20} />
			</div>

			<div class="form-group">
				<label for="ai-count">AI Opponents</label>
				<div class="btn-group">
					{#each [1, 2, 3] as count}
						<button
							class="option-btn"
							class:selected={aiCount === count}
							onclick={() => aiCount = count}
						>{count}</button>
					{/each}
				</div>
			</div>

			<div class="form-group">
				<label for="difficulty">AI Difficulty</label>
				<div class="btn-group">
					{#each ['easy', 'medium', 'hard'] as diff}
						<button
							class="option-btn"
							class:selected={aiDifficulty === diff}
							onclick={() => aiDifficulty = diff as AIDifficulty}
						>{diff}</button>
					{/each}
				</div>
			</div>

			<div class="form-group">
				<label>Target Score</label>
				<div class="btn-group">
					{#each [200, 500, 1000] as score}
						<button
							class="option-btn"
							class:selected={targetScore === score}
							onclick={() => targetScore = score}
						>{score}</button>
					{/each}
				</div>
			</div>

			<details class="house-rules">
				<summary>House Rules</summary>
				<label class="toggle">
					<input type="checkbox" bind:checked={houseRules.stacking} />
					<span>Stacking (Draw 2 on Draw 2)</span>
				</label>
				<label class="toggle">
					<input type="checkbox" bind:checked={houseRules.jumpIn} />
					<span>Jump In (play identical card out of turn)</span>
				</label>
				<label class="toggle">
					<input type="checkbox" bind:checked={houseRules.sevenSwap} />
					<span>7 = Swap hands</span>
				</label>
				<label class="toggle">
					<input type="checkbox" bind:checked={houseRules.zeroRotate} />
					<span>0 = Rotate hands</span>
				</label>
				<label class="toggle">
					<input type="checkbox" bind:checked={houseRules.drawUntilPlayable} />
					<span>Draw until playable</span>
				</label>
			</details>

			<div class="setup-actions">
				<button class="menu-btn" onclick={() => phase = 'menu'}>Back</button>
				<button class="menu-btn primary" onclick={startGame}>Start Game</button>
			</div>
		</div>

	{:else if phase === 'online_setup'}
		<div class="setup">
			<h2>Online Multiplayer</h2>

			<div class="form-group">
				<label for="online-name">Your Name</label>
				<input id="online-name" type="text" bind:value={playerName} maxlength={20} />
			</div>

			<div class="online-options">
				<div class="online-option">
					<h3>Create a Room</h3>
					<p class="option-desc">Start a new game and share the code with friends</p>
					<button
						class="menu-btn primary"
						onclick={handleCreateRoom}
						disabled={isConnecting}
					>
						{isConnecting ? 'Creating...' : 'Create Room'}
					</button>
				</div>

				<div class="divider">OR</div>

				<div class="online-option">
					<h3>Join a Room</h3>
					<p class="option-desc">Enter the 6-character code from your friend</p>
					<input
						type="text"
						class="code-input"
						bind:value={roomCodeInput}
						placeholder="Enter code..."
						maxlength={6}
						style="text-transform: uppercase;"
					/>
					<button
						class="menu-btn"
						onclick={handleJoinRoom}
						disabled={isConnecting}
					>
						{isConnecting ? 'Joining...' : 'Join Room'}
					</button>
				</div>
			</div>

			{#if onlineError}
				<p class="error-msg">{onlineError}</p>
			{/if}

			<button class="menu-btn" onclick={() => { onlineError = ''; phase = 'menu'; }}>Back</button>
		</div>

	{:else if phase === 'online_lobby' && multiplayer}
		<UnoOnlineLobby
			roomCode={multiplayer.roomCode}
			isHost={isMultiplayerHost}
			players={lobbyPlayers}
			onStartGame={handleStartOnlineGame}
			onLeave={backToMenu}
		/>

	{:else if phase === 'playing' && gameState}
		<UnoGame
			{gameState}
			{localPlayerId}
			onStateChange={handleStateChange}
			onRoundEnd={handleRoundEnd}
			onQuit={backToMenu}
			isMultiplayer={multiplayer !== null}
			isHost={isMultiplayerHost}
			onMultiplayerAction={handleMultiplayerAction}
		/>

	{:else if phase === 'round_end' && gameState}
		<div class="round-end">
			<h2>{roundWinnerName} wins the round!</h2>
			<div class="scores">
				<h3>Round Scores</h3>
				{#each gameState.players as player}
					<div class="score-row">
						<span class="score-name">{player.name}</span>
						<span class="score-round">+{roundScores[player.id] ?? 0}</span>
						<span class="score-total">{player.score} pts</span>
					</div>
				{/each}
			</div>
			{#if !multiplayer || isMultiplayerHost}
				<button class="menu-btn primary" onclick={nextRound}>Next Round</button>
			{:else}
				<p class="waiting-for-host">Waiting for host to start next round...</p>
			{/if}
		</div>

	{:else if phase === 'game_end' && gameState}
		<div class="game-end">
			<h1>{gameWinnerName} wins the game!</h1>
			<div class="scores">
				<h3>Final Scores</h3>
				{#each [...gameState.players].sort((a, b) => b.score - a.score) as player}
					<div class="score-row" class:winner={player.id === gameWinnerId}>
						<span class="score-name">{player.name}</span>
						<span class="score-total">{player.score} pts</span>
					</div>
				{/each}
			</div>
			<div class="end-actions">
				{#if !multiplayer || isMultiplayerHost}
					<button class="menu-btn primary" onclick={startGame}>Play Again</button>
				{/if}
				<button class="menu-btn" onclick={backToMenu}>Main Menu</button>
			</div>
		</div>
	{/if}

	{#if hostDisconnected}
		<div class="disconnect-overlay">
			<div class="disconnect-box">
				<h2>Host Disconnected</h2>
				<p>The host has left the game.</p>
				<button class="menu-btn primary" onclick={backToMenu}>Return to Menu</button>
			</div>
		</div>
	{/if}
</div>

<style>
	:global(body) {
		margin: 0;
		overflow: hidden;
	}

	.uno-app {
		width: 100vw;
		height: 100vh;
		background: linear-gradient(135deg, #1a1a3e 0%, #2d1b69 50%, #1a1a3e 100%);
		color: white;
		font-family: system-ui, -apple-system, sans-serif;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	/* Menu */
	.menu {
		text-align: center;
		display: flex;
		flex-direction: column;
		gap: 16px;
		align-items: center;
	}

	.title {
		font-size: 5rem;
		font-weight: 900;
		color: #e74c3c;
		text-shadow: 3px 3px 0 #c0392b, 6px 6px 0 rgba(0,0,0,0.3);
		margin: 0 0 20px;
		letter-spacing: 10px;
	}

	.menu-btn {
		background: rgba(255, 255, 255, 0.1);
		border: 2px solid rgba(255, 255, 255, 0.2);
		color: white;
		padding: 12px 32px;
		border-radius: 8px;
		font-size: 1.1rem;
		cursor: pointer;
		transition: all 0.2s;
		min-width: 250px;
	}

	.menu-btn:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.2);
		transform: translateY(-2px);
	}

	.menu-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.menu-btn.primary {
		background: #e74c3c;
		border-color: #c0392b;
	}

	.menu-btn.primary:hover:not(:disabled) {
		background: #c0392b;
	}

	.back-link {
		color: rgba(255, 255, 255, 0.5);
		font-size: 0.85rem;
		margin-top: 10px;
	}

	/* Setup */
	.setup {
		max-width: 420px;
		width: 90%;
		display: flex;
		flex-direction: column;
		gap: 16px;
		max-height: 90vh;
		overflow-y: auto;
	}

	.setup h2 {
		text-align: center;
		margin: 0;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.form-group label {
		font-size: 0.85rem;
		color: rgba(255, 255, 255, 0.7);
		text-transform: uppercase;
		letter-spacing: 1px;
	}

	.form-group input[type="text"] {
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.2);
		color: white;
		padding: 10px;
		border-radius: 6px;
		font-size: 1rem;
	}

	.btn-group {
		display: flex;
		gap: 8px;
	}

	.option-btn {
		flex: 1;
		padding: 8px;
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.2);
		color: white;
		border-radius: 6px;
		cursor: pointer;
		text-transform: capitalize;
		font-size: 0.9rem;
		transition: all 0.15s;
	}

	.option-btn.selected {
		background: #e74c3c;
		border-color: #c0392b;
	}

	.option-btn:hover:not(.selected) {
		background: rgba(255, 255, 255, 0.2);
	}

	.house-rules {
		background: rgba(255, 255, 255, 0.05);
		border-radius: 8px;
		padding: 12px;
	}

	.house-rules summary {
		cursor: pointer;
		color: rgba(255, 255, 255, 0.7);
		font-size: 0.85rem;
		text-transform: uppercase;
		letter-spacing: 1px;
	}

	.toggle {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 0;
		font-size: 0.9rem;
		cursor: pointer;
	}

	.toggle input {
		accent-color: #e74c3c;
	}

	.setup-actions {
		display: flex;
		gap: 10px;
	}

	.setup-actions .menu-btn {
		flex: 1;
		min-width: auto;
	}

	/* Online setup */
	.online-options {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.online-option {
		background: rgba(255, 255, 255, 0.06);
		border-radius: 10px;
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		align-items: center;
		text-align: center;
	}

	.online-option h3 {
		margin: 0;
		font-size: 1rem;
	}

	.option-desc {
		margin: 0;
		font-size: 0.8rem;
		color: rgba(255, 255, 255, 0.5);
	}

	.online-option .menu-btn {
		min-width: 160px;
	}

	.code-input {
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.3);
		color: white;
		padding: 10px 14px;
		border-radius: 6px;
		font-size: 1.2rem;
		font-family: monospace;
		letter-spacing: 4px;
		text-align: center;
		width: 160px;
	}

	.divider {
		text-align: center;
		color: rgba(255, 255, 255, 0.3);
		font-size: 0.85rem;
		letter-spacing: 2px;
	}

	.error-msg {
		color: #e74c3c;
		font-size: 0.9rem;
		text-align: center;
		margin: 0;
		background: rgba(231, 76, 60, 0.1);
		border-radius: 6px;
		padding: 8px 12px;
	}

	/* Round end / Game end */
	.round-end, .game-end {
		text-align: center;
		display: flex;
		flex-direction: column;
		gap: 16px;
		align-items: center;
	}

	.scores {
		background: rgba(255, 255, 255, 0.1);
		border-radius: 12px;
		padding: 16px 24px;
		min-width: 250px;
	}

	.scores h3 {
		margin: 0 0 12px;
		font-size: 0.85rem;
		color: rgba(255, 255, 255, 0.6);
		text-transform: uppercase;
		letter-spacing: 1px;
	}

	.score-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 6px 0;
		gap: 16px;
	}

	.score-row.winner {
		color: #f1c40f;
		font-weight: bold;
	}

	.score-name {
		flex: 1;
		text-align: left;
	}

	.score-round {
		color: #2ecc71;
		font-weight: bold;
	}

	.score-total {
		min-width: 60px;
		text-align: right;
	}

	.end-actions {
		display: flex;
		gap: 10px;
	}

	.waiting-for-host {
		color: rgba(255, 255, 255, 0.6);
		font-style: italic;
		margin: 0;
	}

	.disconnect-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.75);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
	}

	.disconnect-box {
		background: #1a1a3e;
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 16px;
		padding: 32px 40px;
		text-align: center;
		display: flex;
		flex-direction: column;
		gap: 16px;
		align-items: center;
	}

	.disconnect-box h2 {
		margin: 0;
		color: #e74c3c;
	}

	.disconnect-box p {
		margin: 0;
		color: rgba(255, 255, 255, 0.7);
	}
</style>
