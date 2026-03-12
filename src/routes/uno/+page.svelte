<script lang="ts">
	import type { GameState, Player, AIDifficulty, CardColor, HouseRules } from '$lib/uno/types';
	import { createDeck, shuffleDeck, dealHands, findStartCard } from '$lib/uno/deck';
	import { DEFAULT_HOUSE_RULES, DEFAULT_TARGET_SCORE, AI_NAMES } from '$lib/uno/constants';
	import { calculateRoundScore, applyRoundScores, createRoundResult, checkGameEnd } from '$lib/uno/scoring';
	import UnoGame from './UnoGame.svelte';

	type Phase = 'menu' | 'setup' | 'playing' | 'round_end' | 'game_end';

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

		// Assign hands
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
	}

	function handleRoundEnd(winnerId: string, finalState: GameState) {
		roundWinnerId = winnerId;
		roundScores = calculateRoundScore(finalState.players, winnerId);

		const updatedPlayers = applyRoundScores(finalState.players, roundScores);
		const roundResult = createRoundResult(finalState.roundNumber, winnerId, roundScores);

		gameState = {
			...finalState,
			players: updatedPlayers,
			roundHistory: [...finalState.roundHistory, roundResult],
			phase: 'round_end'
		};

		// Check if someone won the game
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
		// Keep scores, start new round
		const players = gameState.players.map((p) => ({ ...p, hand: [], calledUno: false }));
		startRound(players);
	}

	function backToMenu() {
		phase = 'menu';
		gameState = null;
	}

	function getPlayerName(id: string): string {
		return gameState?.players.find((p) => p.id === id)?.name ?? '';
	}

	let roundWinnerName = $derived(getPlayerName(roundWinnerId));
	let gameWinnerName = $derived(getPlayerName(gameWinnerId));
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
			<button class="menu-btn" disabled>
				Online Multiplayer (Coming Soon)
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

	{:else if phase === 'playing' && gameState}
		<UnoGame
			{gameState}
			{localPlayerId}
			onStateChange={handleStateChange}
			onRoundEnd={handleRoundEnd}
			onQuit={backToMenu}
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
			<button class="menu-btn primary" onclick={nextRound}>Next Round</button>
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
				<button class="menu-btn primary" onclick={startGame}>Play Again</button>
				<button class="menu-btn" onclick={backToMenu}>Main Menu</button>
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

	.menu-btn.primary:hover {
		background: #c0392b;
	}

	.back-link {
		color: rgba(255, 255, 255, 0.5);
		font-size: 0.85rem;
		margin-top: 10px;
	}

	/* Setup */
	.setup {
		max-width: 400px;
		width: 90%;
		display: flex;
		flex-direction: column;
		gap: 16px;
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
</style>
