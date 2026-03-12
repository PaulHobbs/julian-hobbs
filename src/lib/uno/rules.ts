import type { Card, CardColor, HouseRules } from './types';

export function canPlayCard(
	card: Card,
	topCard: Card,
	activeColor: CardColor,
	houseRules: HouseRules,
	pendingDraw: number
): boolean {
	// If there's a pending draw from stacking, only matching draw cards can be played
	if (pendingDraw > 0 && houseRules.stacking) {
		if (topCard.value === 'draw2' && card.value === 'draw2') return true;
		if (topCard.value === 'wild_draw4' && card.value === 'wild_draw4') return true;
		return false;
	}

	// If there's a pending draw without stacking, player must draw (can't play)
	if (pendingDraw > 0 && !houseRules.stacking) {
		return false;
	}

	// Wild cards can always be played
	if (card.value === 'wild' || card.value === 'wild_draw4') {
		return true;
	}

	// Match by color
	if (card.color === activeColor) return true;

	// Match by value
	if (card.value === topCard.value) return true;

	return false;
}

export function getPlayableCards(
	hand: Card[],
	topCard: Card,
	activeColor: CardColor,
	houseRules: HouseRules,
	pendingDraw: number
): Card[] {
	return hand.filter((card) => canPlayCard(card, topCard, activeColor, houseRules, pendingDraw));
}

export function canJumpIn(card: Card, topCard: Card): boolean {
	// Must be exact match: same color AND same value (not wilds)
	return card.color !== null && card.color === topCard.color && card.value === topCard.value;
}

export function isValidWildDraw4(hand: Card[], activeColor: CardColor): boolean {
	// WD4 is technically only legal if the player has no cards of the active color
	return !hand.some((c) => c.color === activeColor && c.value !== 'wild_draw4');
}

export function hasPlayableCard(
	hand: Card[],
	topCard: Card,
	activeColor: CardColor,
	houseRules: HouseRules,
	pendingDraw: number
): boolean {
	return hand.some((card) => canPlayCard(card, topCard, activeColor, houseRules, pendingDraw));
}
