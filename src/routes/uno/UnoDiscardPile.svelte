<script lang="ts">
	import type { Card, CardColor } from '$lib/uno/types';
	import { COLOR_HEX } from '$lib/uno/constants';
	import UnoCard from './UnoCard.svelte';

	interface Props {
		topCard: Card;
		activeColor: CardColor;
	}

	let { topCard, activeColor }: Props = $props();
</script>

<div class="discard-pile">
	<UnoCard card={topCard} />
	<div class="active-color" style="background: {COLOR_HEX[activeColor]}">
		<span>{activeColor}</span>
	</div>
</div>

<style>
	.discard-pile {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
	}

	.active-color {
		padding: 2px 12px;
		border-radius: 12px;
		font-size: 0.75rem;
		color: white;
		text-transform: uppercase;
		font-weight: bold;
		letter-spacing: 1px;
		text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5);
	}
</style>
