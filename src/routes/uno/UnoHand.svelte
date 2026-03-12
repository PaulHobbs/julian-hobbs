<script lang="ts">
	import type { Card, CardColor, HouseRules } from '$lib/uno/types';
	import { getPlayableCards } from '$lib/uno/rules';
	import UnoCard from './UnoCard.svelte';

	interface Props {
		hand: Card[];
		topCard: Card;
		activeColor: CardColor;
		houseRules: HouseRules;
		pendingDraw: number;
		isCurrentTurn: boolean;
		onplay: (cardIndex: number) => void;
	}

	let { hand, topCard, activeColor, houseRules, pendingDraw, isCurrentTurn, onplay }: Props = $props();

	let selectedIndex: number | null = $state(null);

	let playableCards = $derived(
		isCurrentTurn ? getPlayableCards(hand, topCard, activeColor, houseRules, pendingDraw) : []
	);

	function isPlayable(card: Card): boolean {
		return playableCards.some((c) => c.id === card.id);
	}

	function handleClick(index: number) {
		if (!isCurrentTurn) return;
		if (!isPlayable(hand[index])) return;

		if (selectedIndex === index) {
			// Play the card
			selectedIndex = null;
			onplay(index);
		} else {
			selectedIndex = index;
		}
	}

	// Reset selection when turn changes
	$effect(() => {
		if (!isCurrentTurn) selectedIndex = null;
	});
</script>

<div class="hand" class:active={isCurrentTurn}>
	{#each hand as card, i (card.id)}
		<div class="card-slot" style="--offset: {Math.max(-25, -hand.length * 1.5)}px">
			<UnoCard
				{card}
				playable={isCurrentTurn && isPlayable(card)}
				selected={selectedIndex === i}
				onclick={() => handleClick(i)}
			/>
		</div>
	{/each}
</div>

<style>
	.hand {
		display: flex;
		justify-content: center;
		padding: 10px;
		min-height: 120px;
		align-items: flex-end;
	}

	.card-slot {
		margin-left: var(--offset);
		transition: margin 0.2s;
	}

	.card-slot:first-child {
		margin-left: 0;
	}

	.hand.active {
		padding-bottom: 15px;
	}
</style>
