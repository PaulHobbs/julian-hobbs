<script lang="ts">
	import UnoCard from './UnoCard.svelte';

	interface Props {
		cardsRemaining: number;
		canDraw: boolean;
		ondraw: () => void;
	}

	let { cardsRemaining, canDraw, ondraw }: Props = $props();
</script>

<div class="draw-pile">
	<button class="draw-button" class:can-draw={canDraw} onclick={ondraw} disabled={!canDraw}>
		<UnoCard faceDown />
		<span class="count">{cardsRemaining}</span>
	</button>
	{#if canDraw}
		<span class="draw-hint">Draw</span>
	{/if}
</div>

<style>
	.draw-pile {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
	}

	.draw-button {
		background: none;
		border: none;
		padding: 0;
		cursor: default;
		position: relative;
	}

	.draw-button.can-draw {
		cursor: pointer;
	}

	.draw-button.can-draw:hover {
		transform: scale(1.05);
	}

	.count {
		position: absolute;
		bottom: -4px;
		right: -4px;
		background: #2d1b69;
		color: white;
		font-size: 0.7rem;
		padding: 2px 6px;
		border-radius: 10px;
		font-weight: bold;
	}

	.draw-hint {
		color: #f1c40f;
		font-size: 0.75rem;
		font-weight: bold;
		animation: pulse 1.5s infinite;
	}

	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.4; }
	}
</style>
