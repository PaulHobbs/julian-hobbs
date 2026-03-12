import type { Card, CardColor, AIDifficulty, GameState } from './types';
import { getPlayableCards } from './rules';
import { CARD_COLORS } from './constants';

export interface AIAction {
	type: 'play' | 'draw';
	cardIndex?: number;
	chosenColor?: CardColor;
}

export function aiChooseAction(
	hand: Card[],
	topCard: Card,
	activeColor: CardColor,
	state: GameState,
	difficulty: AIDifficulty
): AIAction {
	const playable = getPlayableCards(hand, topCard, activeColor, state.houseRules, state.pendingDraw);

	if (playable.length === 0) {
		return { type: 'draw' };
	}

	switch (difficulty) {
		case 'easy':
			return easyAI(hand, playable);
		case 'medium':
			return mediumAI(hand, playable);
		case 'hard':
			return hardAI(hand, playable, state);
	}
}

function easyAI(hand: Card[], playable: Card[]): AIAction {
	// Play the first playable card
	const card = playable[0];
	const cardIndex = hand.findIndex((c) => c.id === card.id);
	const chosenColor = needsColorChoice(card) ? randomColor() : undefined;
	return { type: 'play', cardIndex, chosenColor };
}

function mediumAI(hand: Card[], playable: Card[]): AIAction {
	// Priority: colored cards first (save wilds), prefer matching color
	const sorted = [...playable].sort((a, b) => {
		// Wilds last
		const aWild = a.color === null ? 1 : 0;
		const bWild = b.color === null ? 1 : 0;
		if (aWild !== bWild) return aWild - bWild;

		// Action cards before number cards (they're more impactful)
		const aAction = typeof a.value === 'string' ? 1 : 0;
		const bAction = typeof b.value === 'string' ? 1 : 0;
		if (aAction !== bAction) return bAction - aAction;

		// Higher numbers first (get rid of high-point cards)
		if (typeof a.value === 'number' && typeof b.value === 'number') {
			return b.value - a.value;
		}

		return 0;
	});

	const card = sorted[0];
	const cardIndex = hand.findIndex((c) => c.id === card.id);
	const chosenColor = needsColorChoice(card) ? bestColorForHand(hand) : undefined;
	return { type: 'play', cardIndex, chosenColor };
}

function hardAI(hand: Card[], playable: Card[], state: GameState): AIAction {
	const nextPlayerIdx =
		((state.currentPlayerIndex + state.direction) % state.players.length +
			state.players.length) %
		state.players.length;
	const nextPlayer = state.players[nextPlayerIdx];
	const nextPlayerCardCount = nextPlayer.hand.length;

	// If next player has few cards, prioritize skip/reverse/draw cards
	const sorted = [...playable].sort((a, b) => {
		// If next player has 1-2 cards, heavily prioritize action cards
		if (nextPlayerCardCount <= 2) {
			const aDefensive = isDefensiveCard(a) ? -10 : 0;
			const bDefensive = isDefensiveCard(b) ? -10 : 0;
			if (aDefensive !== bDefensive) return aDefensive - bDefensive;
		}

		// Save WD4 for emergencies
		const aWD4 = a.value === 'wild_draw4' ? 10 : 0;
		const bWD4 = b.value === 'wild_draw4' ? 10 : 0;
		if (aWD4 !== bWD4) return aWD4 - bWD4;

		// Save regular wilds
		const aWild = a.value === 'wild' ? 5 : 0;
		const bWild = b.value === 'wild' ? 5 : 0;
		if (aWild !== bWild) return aWild - bWild;

		// Play cards that change to our strongest color
		const bestColor = bestColorForHand(hand);
		const aMatchesBest = a.color === bestColor ? -2 : 0;
		const bMatchesBest = b.color === bestColor ? -2 : 0;
		if (aMatchesBest !== bMatchesBest) return aMatchesBest - bMatchesBest;

		// Higher numbers first
		if (typeof a.value === 'number' && typeof b.value === 'number') {
			return b.value - a.value;
		}

		return 0;
	});

	const card = sorted[0];
	const cardIndex = hand.findIndex((c) => c.id === card.id);
	const chosenColor = needsColorChoice(card) ? bestColorForHand(hand) : undefined;
	return { type: 'play', cardIndex, chosenColor };
}

function isDefensiveCard(card: Card): boolean {
	return (
		card.value === 'skip' ||
		card.value === 'reverse' ||
		card.value === 'draw2' ||
		card.value === 'wild_draw4'
	);
}

function needsColorChoice(card: Card): boolean {
	return card.value === 'wild' || card.value === 'wild_draw4';
}

function randomColor(): CardColor {
	return CARD_COLORS[Math.floor(Math.random() * CARD_COLORS.length)];
}

function bestColorForHand(hand: Card[]): CardColor {
	const counts: Record<CardColor, number> = { red: 0, blue: 0, green: 0, yellow: 0 };

	for (const card of hand) {
		if (card.color) {
			counts[card.color]++;
		}
	}

	let best: CardColor = 'red';
	let bestCount = 0;
	for (const color of CARD_COLORS) {
		if (counts[color] > bestCount) {
			bestCount = counts[color];
			best = color;
		}
	}

	return best;
}

export function aiShouldCallUno(difficulty: AIDifficulty): boolean {
	if (difficulty === 'easy') return Math.random() > 0.5;
	return true;
}

export function aiShouldChallengeUno(difficulty: AIDifficulty): boolean {
	if (difficulty === 'easy') return false;
	if (difficulty === 'medium') return Math.random() > 0.5;
	return true; // Hard always challenges
}

export function getAIDelay(difficulty: AIDifficulty): number {
	switch (difficulty) {
		case 'easy':
			return 500 + Math.random() * 500;
		case 'medium':
			return 700 + Math.random() * 800;
		case 'hard':
			return 1000 + Math.random() * 1500;
	}
}
