import type { GameState, CardColor } from './types';

export function applyCardEffect(state: GameState, cardIndex: number): GameState {
	const player = state.players[state.currentPlayerIndex];
	const card = player.hand[cardIndex];

	// Remove card from hand
	const newHand = [...player.hand];
	newHand.splice(cardIndex, 1);

	const newPlayers = state.players.map((p, i) =>
		i === state.currentPlayerIndex ? { ...p, hand: newHand } : p
	);

	// Add card to discard pile
	const newDiscard = [...state.discardPile, card];
	const activeColor = card.chosenColor ?? card.color ?? state.activeColor;

	let newState: GameState = {
		...state,
		players: newPlayers,
		discardPile: newDiscard,
		activeColor,
		hasDrawnThisTurn: false,
		drawnCard: null
	};

	// Check if player has 1 card left (needs to call UNO)
	if (newHand.length === 1) {
		newState.mustCallUno = player.id;
		newState.unoWindowOpen = true;
		newState.unoWindowTargetId = player.id;
	}

	// Check if player won the round
	if (newHand.length === 0) {
		newState.log = [...newState.log, `${player.name} wins the round!`];
		return newState;
	}

	const playerCount = state.players.length;

	switch (card.value) {
		case 'skip': {
			newState.log = [
				...newState.log,
				`${player.name} plays Skip! ${state.players[nextIndex(state)].name} is skipped.`
			];
			// Skip next player
			newState.currentPlayerIndex = skipIndex(state);
			break;
		}
		case 'reverse': {
			newState.direction = (state.direction * -1) as 1 | -1;
			if (playerCount === 2) {
				// In 2-player, reverse acts as skip
				newState.currentPlayerIndex = state.currentPlayerIndex;
				newState.log = [...newState.log, `${player.name} plays Reverse! (acts as Skip in 2-player)`];
			} else {
				newState.currentPlayerIndex = nextIndexWithDir(state.currentPlayerIndex, newState.direction, playerCount);
				newState.log = [...newState.log, `${player.name} plays Reverse!`];
			}
			break;
		}
		case 'draw2': {
			if (state.houseRules.stacking) {
				newState.pendingDraw = state.pendingDraw + 2;
				newState.currentPlayerIndex = nextIndex(state);
				newState.log = [
					...newState.log,
					`${player.name} plays Draw 2! (${newState.pendingDraw} cards stacked)`
				];
			} else {
				// Next player draws 2 and loses turn
				const drawIdx = nextIndex(state);
				newState = drawCardsForPlayer(newState, drawIdx, 2);
				newState.currentPlayerIndex = skipIndex(state);
				newState.log = [
					...newState.log,
					`${player.name} plays Draw 2! ${state.players[drawIdx].name} draws 2 cards.`
				];
			}
			break;
		}
		case 'wild': {
			newState.awaitingColorChoice = true;
			newState.colorChooserPlayerId = player.id;
			newState.log = [...newState.log, `${player.name} plays Wild!`];
			break;
		}
		case 'wild_draw4': {
			newState.awaitingColorChoice = true;
			newState.colorChooserPlayerId = player.id;
			newState.pendingDraw = state.pendingDraw + 4;
			newState.log = [...newState.log, `${player.name} plays Wild Draw 4!`];
			break;
		}
		default: {
			// Number card - check for 7-swap and 0-rotate house rules
			if (card.value === 7 && state.houseRules.sevenSwap) {
				// TODO: implement swap target selection in Phase 2
				newState.currentPlayerIndex = nextIndex(state);
				newState.log = [...newState.log, `${player.name} plays 7.`];
			} else if (card.value === 0 && state.houseRules.zeroRotate) {
				// Rotate hands
				newState = rotateHands(newState);
				newState.currentPlayerIndex = nextIndex(state);
				newState.log = [...newState.log, `${player.name} plays 0! Hands rotate!`];
			} else {
				newState.currentPlayerIndex = nextIndex(state);
				newState.log = [...newState.log, `${player.name} plays ${card.color} ${card.value}.`];
			}
			break;
		}
	}

	return newState;
}

export function applyColorChoice(state: GameState, color: CardColor): GameState {
	const topCard = state.discardPile[state.discardPile.length - 1];
	const newDiscard = [...state.discardPile];
	newDiscard[newDiscard.length - 1] = { ...topCard, chosenColor: color };

	const chooser = state.players.find((p) => p.id === state.colorChooserPlayerId);
	let newState: GameState = {
		...state,
		discardPile: newDiscard,
		activeColor: color,
		awaitingColorChoice: false,
		colorChooserPlayerId: null,
		log: [...state.log, `${chooser?.name} chooses ${color}.`]
	};

	// If it was a Wild Draw 4, next player draws and loses turn (unless stacking)
	if (topCard.value === 'wild_draw4') {
		if (state.houseRules.stacking) {
			newState.currentPlayerIndex = nextIndex(state);
		} else {
			const drawIdx = nextIndex(state);
			newState = drawCardsForPlayer(newState, drawIdx, newState.pendingDraw);
			newState.pendingDraw = 0;
			newState.currentPlayerIndex = skipIndex(state);
			newState.log = [
				...newState.log,
				`${state.players[drawIdx].name} draws ${4} cards and is skipped.`
			];
		}
	} else {
		newState.currentPlayerIndex = nextIndex(state);
	}

	return newState;
}

export function drawCardsForPlayer(state: GameState, playerIndex: number, count: number): GameState {
	let drawPile = [...state.drawPile];
	let discardPile = [...state.discardPile];
	const drawnCards: import('./types').Card[] = [];
	let log = [...state.log];

	for (let i = 0; i < count; i++) {
		if (drawPile.length === 0) {
			// Reshuffle discard pile into draw pile
			if (discardPile.length <= 1) {
				log = appendLog(log, 'No cards left to draw!');
				break;
			}
			const topCard = discardPile[discardPile.length - 1];
			const toShuffle = discardPile.slice(0, -1).map((c) => ({ ...c, chosenColor: undefined }));
			drawPile = shuffle(toShuffle);
			discardPile = [topCard];
			log = appendLog(log, 'Discard pile reshuffled into draw pile.');
		}
		if (drawPile.length > 0) {
			drawnCards.push(drawPile.shift()!);
		}
	}

	const newPlayers = state.players.map((p, i) =>
		i === playerIndex ? { ...p, hand: [...p.hand, ...drawnCards] } : p
	);

	return { ...state, players: newPlayers, drawPile, discardPile, log };
}

const MAX_LOG_ENTRIES = 50;

function appendLog(log: string[], msg: string): string[] {
	const newLog = [...log, msg];
	if (newLog.length > MAX_LOG_ENTRIES) {
		return newLog.slice(-MAX_LOG_ENTRIES);
	}
	return newLog;
}

function shuffle(cards: import('./types').Card[]): import('./types').Card[] {
	const arr = [...cards];
	for (let i = arr.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[arr[i], arr[j]] = [arr[j], arr[i]];
	}
	return arr;
}

function nextIndex(state: GameState): number {
	return nextIndexWithDir(state.currentPlayerIndex, state.direction, state.players.length);
}

function skipIndex(state: GameState): number {
	const next = nextIndex(state);
	return nextIndexWithDir(next, state.direction, state.players.length);
}

function nextIndexWithDir(current: number, direction: number, count: number): number {
	return ((current + direction) % count + count) % count;
}

function rotateHands(state: GameState): GameState {
	const players = state.players.map((p) => ({ ...p }));
	const hands = players.map((p) => p.hand);

	if (state.direction === 1) {
		// Clockwise: each player gets the hand of the player before them
		const last = hands[hands.length - 1];
		for (let i = hands.length - 1; i > 0; i--) {
			players[i].hand = hands[i - 1];
		}
		players[0].hand = last;
	} else {
		// Counter-clockwise
		const first = hands[0];
		for (let i = 0; i < hands.length - 1; i++) {
			players[i].hand = hands[i + 1];
		}
		players[hands.length - 1].hand = first;
	}

	return { ...state, players };
}
