<script lang="ts">
	import type { Card, CardColor, GameState, NetworkMessage, Player } from '$lib/uno/types';
	import { applyCardEffect, applyColorChoice, drawCardsForPlayer } from '$lib/uno/effects';
	import { hasPlayableCard } from '$lib/uno/rules';
	import { aiChooseAction, aiShouldCallUno, getAIDelay } from '$lib/uno/ai';
	import { calculateRoundScore, applyRoundScores, createRoundResult, checkGameEnd } from '$lib/uno/scoring';
	import { UNO_PENALTY_CARDS } from '$lib/uno/constants';
	import UnoHand from './UnoHand.svelte';
	import UnoOpponentHand from './UnoOpponentHand.svelte';
	import UnoDiscardPile from './UnoDiscardPile.svelte';
	import UnoDeck from './UnoDeck.svelte';
	import UnoPlayerInfo from './UnoPlayerInfo.svelte';
	import UnoColorPicker from './UnoColorPicker.svelte';

	interface Props {
		gameState: GameState;
		localPlayerId: string;
		onStateChange: (state: GameState) => void;
		onRoundEnd: (winnerId: string, finalState: GameState) => void;
		onQuit: () => void;
		isMultiplayer?: boolean;
		isHost?: boolean;
		onMultiplayerAction?: (msg: NetworkMessage) => void;
	}

	let { gameState, localPlayerId, onStateChange, onRoundEnd, onQuit, isMultiplayer = false, isHost = false, onMultiplayerAction }: Props = $props();

	// In guest mode: send actions to host, don't apply locally
	let isGuestMode = $derived(isMultiplayer && !isHost);

	let aiTimeout: ReturnType<typeof setTimeout> | null = null;

	// Derived values
	let localPlayerIndex = $derived(gameState.players.findIndex((p) => p.id === localPlayerId));
	let localPlayer = $derived(gameState.players[localPlayerIndex]);
	let currentPlayer = $derived(gameState.players[gameState.currentPlayerIndex]);
	let isLocalTurn = $derived(currentPlayer?.id === localPlayerId);
	let topCard = $derived(gameState.discardPile[gameState.discardPile.length - 1]);
	let opponents = $derived(getOpponents());
	let canDraw = $derived(
		isLocalTurn &&
		!gameState.awaitingColorChoice &&
		!gameState.hasDrawnThisTurn
	);
	let showColorPicker = $derived(
		gameState.awaitingColorChoice && gameState.colorChooserPlayerId === localPlayerId
	);
	let directionSymbol = $derived(gameState.direction === 1 ? '\u27F3' : '\u27F2');

	function getOpponents(): { player: Player; position: 'top' | 'left' | 'right' }[] {
		const others = gameState.players
			.map((p, i) => ({ player: p, originalIndex: i }))
			.filter((p) => p.player.id !== localPlayerId);

		if (others.length === 1) {
			return [{ player: others[0].player, position: 'top' }];
		} else if (others.length === 2) {
			return [
				{ player: others[0].player, position: 'left' },
				{ player: others[1].player, position: 'right' }
			];
		} else {
			return [
				{ player: others[0].player, position: 'left' },
				{ player: others[1].player, position: 'top' },
				{ player: others[2].player, position: 'right' }
			];
		}
	}

	function handlePlayCard(cardIndex: number) {
		if (!isLocalTurn || gameState.awaitingColorChoice) return;

		if (isGuestMode) {
			onMultiplayerAction?.({
				type: 'play_card',
				payload: { cardIndex },
				senderId: localPlayerId,
				timestamp: Date.now()
			});
			return;
		}

		const card = localPlayer.hand[cardIndex];

		// If it's a wild card, we need to choose color after playing
		if (card.value === 'wild' || card.value === 'wild_draw4') {
			// Apply effect first (this sets awaitingColorChoice)
			const newState = applyCardEffect(gameState, getGlobalCardIndex(cardIndex));
			onStateChange(newState);
			return;
		}

		const newState = applyCardEffect(gameState, getGlobalCardIndex(cardIndex));

		// Check for round end
		const updatedPlayer = newState.players[localPlayerIndex];
		if (updatedPlayer.hand.length === 0) {
			onRoundEnd(localPlayerId, newState);
			return;
		}

		onStateChange(newState);
	}

	function getGlobalCardIndex(localCardIndex: number): number {
		// The card index in the current player's hand
		// Since we're the local player and it's our turn, localPlayerIndex === currentPlayerIndex
		return localCardIndex;
	}

	function handleDraw() {
		if (!canDraw) return;

		if (isGuestMode) {
			onMultiplayerAction?.({
				type: 'draw_card',
				payload: {},
				senderId: localPlayerId,
				timestamp: Date.now()
			});
			return;
		}

		let newState: GameState;

		if (gameState.pendingDraw > 0) {
			// Must draw pending cards
			newState = drawCardsForPlayer(gameState, gameState.currentPlayerIndex, gameState.pendingDraw);
			newState = {
				...newState,
				pendingDraw: 0,
				log: [...newState.log, `${currentPlayer.name} draws ${gameState.pendingDraw} cards.`]
			};
			// Advance turn after drawing penalty
			newState.currentPlayerIndex = advanceTurn(newState);
		} else {
			// Draw one card
			newState = drawCardsForPlayer(gameState, gameState.currentPlayerIndex, 1);
			const drawnCard = newState.players[gameState.currentPlayerIndex].hand[
				newState.players[gameState.currentPlayerIndex].hand.length - 1
			];
			newState = {
				...newState,
				hasDrawnThisTurn: true,
				drawnCard,
				log: [...newState.log, `${currentPlayer.name} draws a card.`]
			};

			// Check if drawn card is playable - if not, auto-pass
			if (!hasPlayableCard(
				[drawnCard],
				topCard,
				gameState.activeColor,
				gameState.houseRules,
				0
			)) {
				newState.currentPlayerIndex = advanceTurn(newState);
				newState.hasDrawnThisTurn = false;
				newState.drawnCard = null;
				newState.log = [...newState.log, `${currentPlayer.name} passes.`];
			}
		}

		onStateChange(newState);
	}

	function handlePassTurn() {
		if (!isLocalTurn || !gameState.hasDrawnThisTurn) return;

		if (isGuestMode) {
			onMultiplayerAction?.({
				type: 'pass_turn',
				payload: {},
				senderId: localPlayerId,
				timestamp: Date.now()
			});
			return;
		}

		const newState = {
			...gameState,
			currentPlayerIndex: advanceTurn(gameState),
			hasDrawnThisTurn: false,
			drawnCard: null,
			log: [...gameState.log, `${currentPlayer.name} passes.`]
		};
		onStateChange(newState);
	}

	function handleColorChoice(color: CardColor) {
		if (isGuestMode) {
			onMultiplayerAction?.({
				type: 'choose_color',
				payload: { color },
				senderId: localPlayerId,
				timestamp: Date.now()
			});
			return;
		}

		const newState = applyColorChoice(gameState, color);

		// Check for round end after wild
		const chooserId = gameState.colorChooserPlayerId;
		if (chooserId) {
			const updatedPlayer = newState.players.find((p) => p.id === chooserId);
			if (updatedPlayer && updatedPlayer.hand.length === 0) {
				onRoundEnd(chooserId, newState);
				return;
			}
		}

		onStateChange(newState);
	}

	function handleCallUno() {
		if (localPlayer.hand.length <= 2) {
			if (isGuestMode) {
				onMultiplayerAction?.({
					type: 'call_uno',
					payload: {},
					senderId: localPlayerId,
					timestamp: Date.now()
				});
				return;
			}

			const newPlayers = gameState.players.map((p) =>
				p.id === localPlayerId ? { ...p, calledUno: true } : p
			);
			onStateChange({
				...gameState,
				players: newPlayers,
				mustCallUno: null,
				unoWindowOpen: false,
				log: [...gameState.log, `${localPlayer.name} calls UNO!`]
			});
		}
	}

	function advanceTurn(state: GameState): number {
		return ((state.currentPlayerIndex + state.direction) % state.players.length + state.players.length) % state.players.length;
	}

	// AI turn handling (only host or single-player runs AI)
	$effect(() => {
		if (isGuestMode) return;
		if (currentPlayer?.type === 'ai' && gameState.phase === 'playing') {
			if (aiTimeout) clearTimeout(aiTimeout);

			// Handle AI color choice
			if (gameState.awaitingColorChoice && gameState.colorChooserPlayerId === currentPlayer.id) {
				const delay = getAIDelay(currentPlayer.aiDifficulty ?? 'easy');
				aiTimeout = setTimeout(() => {
					const action = aiChooseAction(
						currentPlayer.hand,
						topCard,
						gameState.activeColor,
						gameState,
						currentPlayer.aiDifficulty ?? 'easy'
					);
					// AI already played the wild, just need to choose color
					const colors: CardColor[] = ['red', 'blue', 'green', 'yellow'];
					const bestColor = action.chosenColor ?? colors[0];
					handleAIColorChoice(bestColor);
				}, delay);
				return;
			}

			const delay = getAIDelay(currentPlayer.aiDifficulty ?? 'easy');
			aiTimeout = setTimeout(() => {
				executeAITurn();
			}, delay);
		}

		return () => {
			if (aiTimeout) clearTimeout(aiTimeout);
		};
	});

	function executeAITurn() {
		const player = gameState.players[gameState.currentPlayerIndex];
		if (player.type !== 'ai') return;

		const action = aiChooseAction(
			player.hand,
			topCard,
			gameState.activeColor,
			gameState,
			player.aiDifficulty ?? 'easy'
		);

		if (action.type === 'play' && action.cardIndex !== undefined) {
			const card = player.hand[action.cardIndex];

			// Set chosen color for wilds before applying effect
			if ((card.value === 'wild' || card.value === 'wild_draw4') && action.chosenColor) {
				const newPlayers = gameState.players.map((p, i) => {
					if (i !== gameState.currentPlayerIndex) return p;
					const newHand = p.hand.map((c, ci) =>
						ci === action.cardIndex ? { ...c, chosenColor: action.chosenColor } : c
					);
					return { ...p, hand: newHand };
				});
				let newState = { ...gameState, players: newPlayers };
				newState = applyCardEffect(newState, action.cardIndex);

				// AI calls UNO
				const updatedPlayer = newState.players[gameState.currentPlayerIndex];
				if (updatedPlayer.hand.length === 1 && aiShouldCallUno(player.aiDifficulty ?? 'easy')) {
					newState = {
						...newState,
						players: newState.players.map((p, i) =>
							i === gameState.currentPlayerIndex ? { ...p, calledUno: true } : p
						),
						log: [...newState.log, `${player.name} calls UNO!`]
					};
				}

				// For wilds, AI auto-picks color
				if (newState.awaitingColorChoice) {
					newState = applyColorChoice(newState, action.chosenColor!);
				}

				// Check round end
				if (updatedPlayer.hand.length === 0) {
					onRoundEnd(player.id, newState);
					return;
				}

				onStateChange(newState);
			} else {
				let newState = applyCardEffect(gameState, action.cardIndex);

				// AI calls UNO
				const updatedPlayer = newState.players[gameState.currentPlayerIndex];
				if (updatedPlayer.hand.length === 1 && aiShouldCallUno(player.aiDifficulty ?? 'easy')) {
					newState = {
						...newState,
						players: newState.players.map((p, i) =>
							i === gameState.currentPlayerIndex ? { ...p, calledUno: true } : p
						),
						log: [...newState.log, `${player.name} calls UNO!`]
					};
				}

				if (updatedPlayer.hand.length === 0) {
					onRoundEnd(player.id, newState);
					return;
				}

				onStateChange(newState);
			}
		} else {
			// AI draws a card
			let newState: GameState;
			if (gameState.pendingDraw > 0) {
				newState = drawCardsForPlayer(gameState, gameState.currentPlayerIndex, gameState.pendingDraw);
				newState = {
					...newState,
					pendingDraw: 0,
					currentPlayerIndex: advanceTurn(gameState),
					log: [...newState.log, `${player.name} draws ${gameState.pendingDraw} cards.`]
				};
			} else {
				// Draw one card and check if it's playable (Bug #11 fix)
				newState = drawCardsForPlayer(gameState, gameState.currentPlayerIndex, 1);
				const drawnCard = newState.players[gameState.currentPlayerIndex].hand[
					newState.players[gameState.currentPlayerIndex].hand.length - 1
				];

				if (hasPlayableCard([drawnCard], topCard, gameState.activeColor, gameState.houseRules, 0)) {
					// AI plays the drawn card
					const drawnCardIndex = newState.players[gameState.currentPlayerIndex].hand.length - 1;
					const aiAction = aiChooseAction(
						[drawnCard],
						topCard,
						gameState.activeColor,
						newState,
						player.aiDifficulty ?? 'easy'
					);

					// Play the drawn card
					if ((drawnCard.value === 'wild' || drawnCard.value === 'wild_draw4') && aiAction.chosenColor) {
						const playersWithColor = newState.players.map((p, i) => {
							if (i !== gameState.currentPlayerIndex) return p;
							const newHand = p.hand.map((c, ci) =>
								ci === drawnCardIndex ? { ...c, chosenColor: aiAction.chosenColor } : c
							);
							return { ...p, hand: newHand };
						});
						newState = { ...newState, players: playersWithColor };
					}

					newState = applyCardEffect(newState, drawnCardIndex);
					newState = { ...newState, log: [...newState.log, `${player.name} draws and plays ${drawnCard.color ?? ''} ${drawnCard.value}.`] };

					if (newState.awaitingColorChoice && aiAction.chosenColor) {
						newState = applyColorChoice(newState, aiAction.chosenColor);
					}

					const updatedPlayer = newState.players[gameState.currentPlayerIndex];
					if (updatedPlayer.hand.length === 0) {
						onRoundEnd(player.id, newState);
						return;
					}
				} else {
					newState = {
						...newState,
						currentPlayerIndex: advanceTurn(gameState),
						log: [...newState.log, `${player.name} draws a card and passes.`]
					};
				}
			}
			onStateChange(newState);
		}
	}

	function handleAIColorChoice(color: CardColor) {
		const newState = applyColorChoice(gameState, color);
		const chooserId = gameState.colorChooserPlayerId;
		if (chooserId) {
			const updatedPlayer = newState.players.find((p) => p.id === chooserId);
			if (updatedPlayer && updatedPlayer.hand.length === 0) {
				onRoundEnd(chooserId, newState);
				return;
			}
		}
		onStateChange(newState);
	}

	// Trim log to last 5 entries for display
	let displayLog = $derived(gameState.log.slice(-5));
</script>

<div class="game-board">
	<button class="quit-btn" onclick={onQuit}>Quit</button>

	<!-- Opponents -->
	<div class="opponents">
		{#each opponents as opp}
			<div class="opponent-area {opp.position}">
				<UnoPlayerInfo
					player={opp.player}
					isCurrentTurn={currentPlayer?.id === opp.player.id}
				/>
				<UnoOpponentHand
					cardCount={opp.player.hand.length}
					position={opp.position}
				/>
			</div>
		{/each}
	</div>

	<!-- Center area: draw pile + discard pile -->
	<div class="center">
		<div class="direction">{directionSymbol}</div>
		<div class="piles">
			<UnoDeck
				cardsRemaining={gameState.drawPile.length}
				{canDraw}
				ondraw={handleDraw}
			/>
			<UnoDiscardPile {topCard} activeColor={gameState.activeColor} />
		</div>
		{#if gameState.pendingDraw > 0}
			<div class="pending-draw">+{gameState.pendingDraw} pending!</div>
		{/if}
	</div>

	<!-- Game log -->
	<div class="game-log">
		{#each displayLog as msg}
			<div class="log-entry">{msg}</div>
		{/each}
	</div>

	<!-- Local player -->
	<div class="local-area">
		<div class="local-controls">
			<UnoPlayerInfo player={localPlayer} isCurrentTurn={isLocalTurn} />
			{#if isLocalTurn && localPlayer.hand.length <= 2}
				<button class="uno-btn" onclick={handleCallUno}>UNO!</button>
			{/if}
			{#if isLocalTurn && gameState.hasDrawnThisTurn}
				<button class="pass-btn" onclick={handlePassTurn}>Pass</button>
			{/if}
		</div>
		<UnoHand
			hand={localPlayer.hand}
			{topCard}
			activeColor={gameState.activeColor}
			houseRules={gameState.houseRules}
			pendingDraw={gameState.pendingDraw}
			isCurrentTurn={isLocalTurn && !gameState.awaitingColorChoice}
			onplay={handlePlayCard}
		/>
	</div>

	<!-- Color picker modal -->
	{#if showColorPicker}
		<UnoColorPicker onpick={handleColorChoice} />
	{/if}

	<!-- Multiplayer: remote player turn indicator -->
	{#if isGuestMode && !isLocalTurn && currentPlayer}
		<div class="remote-turn-banner">
			Waiting for {currentPlayer.name}...
		</div>
	{/if}
</div>

<style>
	.game-board {
		display: flex;
		flex-direction: column;
		height: 100vh;
		width: 100%;
		overflow: hidden;
		position: relative;
	}

	.quit-btn {
		position: absolute;
		top: 10px;
		right: 10px;
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.2);
		color: rgba(255, 255, 255, 0.6);
		padding: 4px 12px;
		border-radius: 6px;
		font-size: 0.75rem;
		cursor: pointer;
		z-index: 10;
	}

	.quit-btn:hover {
		background: rgba(255, 255, 255, 0.2);
		color: white;
	}

	.opponents {
		display: flex;
		justify-content: center;
		gap: 30px;
		padding: 10px;
		flex-shrink: 0;
	}

	.opponent-area {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 5px;
	}

	.center {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 10px;
	}

	.piles {
		display: flex;
		gap: 30px;
		align-items: center;
	}

	.direction {
		font-size: 2rem;
		color: rgba(255, 255, 255, 0.4);
	}

	.pending-draw {
		color: #e74c3c;
		font-weight: bold;
		font-size: 1.1rem;
		animation: pulse 1s infinite;
	}

	.game-log {
		padding: 0 20px;
		max-height: 80px;
		overflow: hidden;
	}

	.log-entry {
		color: rgba(255, 255, 255, 0.6);
		font-size: 0.75rem;
		line-height: 1.4;
	}

	.local-area {
		flex-shrink: 0;
		padding-bottom: 10px;
	}

	.local-controls {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 10px;
		padding: 5px;
	}

	.uno-btn {
		background: #e74c3c;
		color: white;
		border: none;
		border-radius: 20px;
		padding: 8px 20px;
		font-weight: 900;
		font-size: 1rem;
		cursor: pointer;
		animation: pulse 0.8s infinite;
		text-transform: uppercase;
	}

	.uno-btn:hover {
		background: #c0392b;
		transform: scale(1.1);
	}

	.pass-btn {
		background: rgba(255, 255, 255, 0.2);
		color: white;
		border: 1px solid rgba(255, 255, 255, 0.3);
		border-radius: 20px;
		padding: 6px 16px;
		cursor: pointer;
		font-size: 0.85rem;
	}

	.pass-btn:hover {
		background: rgba(255, 255, 255, 0.3);
	}

	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.6; }
	}

	.remote-turn-banner {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		background: rgba(0, 0, 0, 0.7);
		color: rgba(255, 255, 255, 0.8);
		padding: 10px 24px;
		border-radius: 24px;
		font-size: 0.95rem;
		pointer-events: none;
		animation: pulse 1.5s infinite;
		z-index: 5;
	}
</style>
