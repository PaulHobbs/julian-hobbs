<script lang="ts">
	import UnoCard from './UnoCard.svelte';

	interface Props {
		cardCount: number;
		position: 'top' | 'left' | 'right';
	}

	let { cardCount, position }: Props = $props();
</script>

<div class="opponent-hand {position}">
	{#each Array(Math.min(cardCount, 15)) as _, i}
		<div
			class="card-slot"
			style="--offset: {position === 'top' ? Math.max(-35, -cardCount * 2) : Math.max(-50, -cardCount * 3)}px"
		>
			<UnoCard faceDown small />
		</div>
	{/each}
	{#if cardCount > 15}
		<span class="overflow-count">+{cardCount - 15}</span>
	{/if}
</div>

<style>
	.opponent-hand {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 5px;
	}

	.opponent-hand.top {
		flex-direction: row;
	}

	.opponent-hand.left,
	.opponent-hand.right {
		flex-direction: column;
	}

	.opponent-hand.left .card-slot,
	.opponent-hand.right .card-slot {
		margin-top: var(--offset);
		margin-left: 0;
	}

	.opponent-hand.left .card-slot:first-child,
	.opponent-hand.right .card-slot:first-child {
		margin-top: 0;
	}

	.card-slot {
		margin-left: var(--offset);
	}

	.card-slot:first-child {
		margin-left: 0;
	}

	.overflow-count {
		color: #aaa;
		font-size: 0.8rem;
		margin-left: 5px;
	}
</style>
