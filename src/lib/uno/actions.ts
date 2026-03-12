import type { CardColor, GameState, NetworkMessage } from './types';
import { applyCardEffect, applyColorChoice, drawCardsForPlayer } from './effects';
import { canPlayCard, hasPlayableCard } from './rules';

export type ActionResult =
	| { type: 'state_change'; state: GameState }
	| { type: 'round_end'; winnerId: string; state: GameState };

export function processPlayerAction(
	gameState: GameState,
	playerId: string,
	msg: NetworkMessage
): ActionResult | null {
	const playerIndex = gameState.players.findIndex((p) => p.id === playerId);
	if (playerIndex === -1) return null;

	switch (msg.type) {
		case 'play_card': {
			if (gameState.currentPlayerIndex !== playerIndex) return null;
			if (gameState.awaitingColorChoice) return null;

			const payload = msg.payload as { cardIndex: number };
			const player = gameState.players[playerIndex];

			if (payload.cardIndex < 0 || payload.cardIndex >= player.hand.length) return null;

			// Validate card is actually playable (prevent cheating)
			const topCard = gameState.discardPile[gameState.discardPile.length - 1];
			const card = player.hand[payload.cardIndex];
			if (!canPlayCard(card, topCard, gameState.activeColor, gameState.houseRules, gameState.pendingDraw)) {
				return null;
			}

			const newState = applyCardEffect(gameState, payload.cardIndex);
			const updatedPlayer = newState.players[playerIndex];

			if (updatedPlayer.hand.length === 0) {
				return { type: 'round_end', winnerId: playerId, state: newState };
			}

			return { type: 'state_change', state: newState };
		}

		case 'draw_card': {
			if (gameState.currentPlayerIndex !== playerIndex) return null;
			if (gameState.awaitingColorChoice) return null;
			if (gameState.hasDrawnThisTurn) return null;

			const player = gameState.players[playerIndex];
			const topCard = gameState.discardPile[gameState.discardPile.length - 1];

			let newState: GameState;

			if (gameState.pendingDraw > 0) {
				newState = drawCardsForPlayer(gameState, playerIndex, gameState.pendingDraw);
				newState = {
					...newState,
					pendingDraw: 0,
					currentPlayerIndex: advanceTurn(newState),
					log: [...newState.log, `${player.name} draws ${gameState.pendingDraw} cards.`]
				};
			} else {
				newState = drawCardsForPlayer(gameState, playerIndex, 1);
				const drawnCard =
					newState.players[playerIndex].hand[newState.players[playerIndex].hand.length - 1];
				newState = {
					...newState,
					hasDrawnThisTurn: true,
					drawnCard,
					log: [...newState.log, `${player.name} draws a card.`]
				};

				if (!hasPlayableCard([drawnCard], topCard, gameState.activeColor, gameState.houseRules, 0)) {
					newState = {
						...newState,
						currentPlayerIndex: advanceTurn(newState),
						hasDrawnThisTurn: false,
						drawnCard: null,
						log: [...newState.log, `${player.name} passes.`]
					};
				}
			}

			return { type: 'state_change', state: newState };
		}

		case 'pass_turn': {
			if (gameState.currentPlayerIndex !== playerIndex) return null;
			if (!gameState.hasDrawnThisTurn) return null;

			const player = gameState.players[playerIndex];
			const newState = {
				...gameState,
				currentPlayerIndex: advanceTurn(gameState),
				hasDrawnThisTurn: false,
				drawnCard: null,
				log: [...gameState.log, `${player.name} passes.`]
			};

			return { type: 'state_change', state: newState };
		}

		case 'choose_color': {
			if (!gameState.awaitingColorChoice) return null;
			if (gameState.colorChooserPlayerId !== playerId) return null;

			const payload = msg.payload as { color: CardColor };
			const newState = applyColorChoice(gameState, payload.color);
			const updatedPlayer = newState.players[playerIndex];

			if (updatedPlayer.hand.length === 0) {
				return { type: 'round_end', winnerId: playerId, state: newState };
			}

			return { type: 'state_change', state: newState };
		}

		case 'call_uno': {
			const player = gameState.players[playerIndex];
			if (player.hand.length > 2) return null;

			const newPlayers = gameState.players.map((p) =>
				p.id === playerId ? { ...p, calledUno: true } : p
			);
			// Only clear mustCallUno/unoWindow if it was set for THIS player
			const newState = {
				...gameState,
				players: newPlayers,
				mustCallUno: gameState.mustCallUno === playerId ? null : gameState.mustCallUno,
				unoWindowOpen: gameState.mustCallUno === playerId ? false : gameState.unoWindowOpen,
				log: [...gameState.log, `${player.name} calls UNO!`]
			};

			return { type: 'state_change', state: newState };
		}

		default:
			return null;
	}
}

function advanceTurn(state: GameState): number {
	return (
		((state.currentPlayerIndex + state.direction) % state.players.length + state.players.length) %
		state.players.length
	);
}
