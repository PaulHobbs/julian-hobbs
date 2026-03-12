<script lang="ts">
	import type { CardColor } from '$lib/uno/types';
	import { COLOR_HEX } from '$lib/uno/constants';

	interface Props {
		onpick: (color: CardColor) => void;
	}

	let { onpick }: Props = $props();

	const colors: CardColor[] = ['red', 'blue', 'green', 'yellow'];
</script>

<div class="overlay">
	<div class="picker">
		<h3>Choose a color</h3>
		<div class="colors">
			{#each colors as color}
				<button
					class="color-btn"
					style="background: {COLOR_HEX[color]}"
					onclick={() => onpick(color)}
				>
					{color}
				</button>
			{/each}
		</div>
	</div>
</div>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.7);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
	}

	.picker {
		background: #1a1a2e;
		padding: 24px;
		border-radius: 16px;
		text-align: center;
		box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
	}

	h3 {
		color: white;
		margin: 0 0 16px;
		font-size: 1.2rem;
	}

	.colors {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}

	.color-btn {
		width: 80px;
		height: 80px;
		border: 3px solid rgba(255, 255, 255, 0.3);
		border-radius: 12px;
		color: white;
		font-weight: bold;
		font-size: 0.9rem;
		text-transform: uppercase;
		cursor: pointer;
		transition: transform 0.15s, box-shadow 0.15s;
		text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5);
	}

	.color-btn:hover {
		transform: scale(1.1);
		box-shadow: 0 4px 15px rgba(255, 255, 255, 0.3);
	}
</style>
