<script lang="ts">
	import { onMount } from 'svelte';

	type Cell = string | null;
	type Shape = boolean[][];
	type Piece = { shape: Shape; color: string };

	const BOARD_SIZE = 8;
	const COLORS = ['#e74c3c', '#e67e22', '#2ecc71', '#3498db', '#9b59b6', '#f1c40f', '#1abc9c'];

	const SHAPES: Shape[] = [
		// 1x1
		[[true]],
		// Lines horizontal
		[[true, true]],
		[[true, true, true]],
		[[true, true, true, true]],
		[[true, true, true, true, true]],
		// Lines vertical
		[[true], [true]],
		[[true], [true], [true]],
		[[true], [true], [true], [true]],
		[[true], [true], [true], [true], [true]],
		// Squares
		[[true, true], [true, true]],
		[[true, true, true], [true, true, true], [true, true, true]],
		// L-shapes
		[[true, false], [true, false], [true, true]],
		[[false, true], [false, true], [true, true]],
		[[true, true], [true, false], [true, false]],
		[[true, true], [false, true], [false, true]],
		// T-shapes
		[[true, true, true], [false, true, false]],
		[[false, true, false], [true, true, true]],
		[[true, false], [true, true], [true, false]],
		[[false, true], [true, true], [false, true]],
		// Z/S shapes
		[[true, true, false], [false, true, true]],
		[[false, true, true], [true, true, false]],
		[[true, false], [true, true], [false, true]],
		[[false, true], [true, true], [true, false]],
		// Corner pieces (2x2 L)
		[[true, true], [true, false]],
		[[true, true], [false, true]],
		[[true, false], [true, true]],
		[[false, true], [true, true]],
	];

	let board: Cell[][] = $state(createEmptyBoard());
	let pieces: (Piece | null)[] = $state([]);
	let selectedPieceIndex: number | null = $state(null);
	let score: number = $state(0);
	let highScore: number = $state(0);
	let gameOver: boolean = $state(false);
	let hoverRow: number | null = $state(null);
	let hoverCol: number | null = $state(null);
	let clearingCells: Set<string> = $state(new Set());
	let comboText: string = $state('');
	let comboTimeout: ReturnType<typeof setTimeout> | null = null;

	// Drag-and-drop state
	let dragPieceIndex: number | null = $state(null);
	let dragX: number = $state(0);
	let dragY: number = $state(0);
	let isDragging: boolean = $state(false);
	let boardEl: HTMLDivElement | undefined = $state(undefined);

	function createEmptyBoard(): Cell[][] {
		return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
	}

	function randomColor(): string {
		return COLORS[Math.floor(Math.random() * COLORS.length)];
	}

	function generatePiece(): Piece {
		const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
		return { shape, color: randomColor() };
	}

	function generatePieces(): void {
		pieces = [generatePiece(), generatePiece(), generatePiece()];
		selectedPieceIndex = null;
	}

	function canPlacePiece(piece: Piece, row: number, col: number): boolean {
		for (let r = 0; r < piece.shape.length; r++) {
			for (let c = 0; c < piece.shape[r].length; c++) {
				if (piece.shape[r][c]) {
					const br = row + r;
					const bc = col + c;
					if (br < 0 || br >= BOARD_SIZE || bc < 0 || bc >= BOARD_SIZE) return false;
					if (board[br][bc] !== null) return false;
				}
			}
		}
		return true;
	}

	function canPieceFitAnywhere(piece: Piece): boolean {
		for (let r = 0; r < BOARD_SIZE; r++) {
			for (let c = 0; c < BOARD_SIZE; c++) {
				if (canPlacePiece(piece, r, c)) return true;
			}
		}
		return false;
	}

	function canAnyPieceFit(): boolean {
		for (const piece of pieces) {
			if (piece && canPieceFitAnywhere(piece)) return true;
		}
		return false;
	}

	function placePiece(piece: Piece, row: number, col: number): void {
		let cellsPlaced = 0;
		const newBoard = board.map(r => [...r]);
		for (let r = 0; r < piece.shape.length; r++) {
			for (let c = 0; c < piece.shape[r].length; c++) {
				if (piece.shape[r][c]) {
					newBoard[row + r][col + c] = piece.color;
					cellsPlaced++;
				}
			}
		}
		board = newBoard;
		score += cellsPlaced;

		checkAndClearLines();
	}

	function checkAndClearLines(): void {
		const rowsToClear: number[] = [];
		const colsToClear: number[] = [];

		for (let r = 0; r < BOARD_SIZE; r++) {
			if (board[r].every(cell => cell !== null)) {
				rowsToClear.push(r);
			}
		}

		for (let c = 0; c < BOARD_SIZE; c++) {
			let full = true;
			for (let r = 0; r < BOARD_SIZE; r++) {
				if (board[r][c] === null) { full = false; break; }
			}
			if (full) colsToClear.push(c);
		}

		const totalLines = rowsToClear.length + colsToClear.length;
		if (totalLines === 0) return;

		// Build set of cells to clear
		const toClear = new Set<string>();
		for (const r of rowsToClear) {
			for (let c = 0; c < BOARD_SIZE; c++) {
				toClear.add(`${r},${c}`);
			}
		}
		for (const c of colsToClear) {
			for (let r = 0; r < BOARD_SIZE; r++) {
				toClear.add(`${r},${c}`);
			}
		}

		// Score bonus
		const lineBonus = totalLines * BOARD_SIZE;
		const comboBonus = totalLines > 1 ? totalLines * 10 : 0;
		score += lineBonus + comboBonus;

		if (totalLines > 1) {
			showCombo(`${totalLines}x Combo! +${lineBonus + comboBonus}`);
		} else {
			showCombo(`Line clear! +${lineBonus}`);
		}

		// Flash animation
		clearingCells = toClear;
		setTimeout(() => {
			const newBoard = board.map(r => [...r]);
			for (const key of toClear) {
				const [r, c] = key.split(',').map(Number);
				newBoard[r][c] = null;
			}
			board = newBoard;
			clearingCells = new Set();

			// Check for cascading clears
			checkAndClearLines();
		}, 300);
	}

	function showCombo(text: string): void {
		comboText = text;
		if (comboTimeout) clearTimeout(comboTimeout);
		comboTimeout = setTimeout(() => { comboText = ''; }, 1500);
	}

	function selectPiece(index: number): void {
		if (gameOver) return;
		if (pieces[index] === null) return;
		selectedPieceIndex = selectedPieceIndex === index ? null : index;
	}

	function completePlacement(pieceIndex: number, row: number, col: number): void {
		const piece = pieces[pieceIndex];
		if (!piece) return;
		if (!canPlacePiece(piece, row, col)) return;

		placePiece(piece, row, col);

		const newPieces = [...pieces];
		newPieces[pieceIndex] = null;
		pieces = newPieces;
		selectedPieceIndex = null;

		if (pieces.every(p => p === null)) {
			setTimeout(() => {
				generatePieces();
				if (!canAnyPieceFit()) {
					endGame();
				}
			}, 350);
		} else {
			if (!canAnyPieceFit()) {
				setTimeout(() => endGame(), 350);
			}
		}
	}

	function handleBoardClick(row: number, col: number): void {
		if (gameOver || selectedPieceIndex === null) return;
		completePlacement(selectedPieceIndex, row, col);
	}

	function handleBoardHover(row: number, col: number): void {
		hoverRow = row;
		hoverCol = col;
	}

	function handleBoardLeave(): void {
		hoverRow = null;
		hoverCol = null;
	}

	// --- Drag-and-drop handlers ---
	function getBoardCellFromPoint(x: number, y: number): { row: number; col: number } | null {
		if (!boardEl) return null;
		const rect = boardEl.getBoundingClientRect();
		const padding = 6;
		const innerX = x - rect.left - padding;
		const innerY = y - rect.top - padding;
		const cellSize = (rect.width - padding * 2) / BOARD_SIZE;
		const col = Math.floor(innerX / cellSize);
		const row = Math.floor(innerY / cellSize);
		if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) return null;
		return { row, col };
	}

	function handlePiecePointerDown(e: PointerEvent, index: number): void {
		if (gameOver || pieces[index] === null) return;
		e.preventDefault();
		(e.target as HTMLElement).setPointerCapture(e.pointerId);
		dragPieceIndex = index;
		dragX = e.clientX;
		dragY = e.clientY;
		isDragging = false;
	}

	function handlePointerMove(e: PointerEvent): void {
		if (dragPieceIndex === null) return;
		e.preventDefault();
		dragX = e.clientX;
		dragY = e.clientY;
		isDragging = true;

		// Update hover preview based on drag position
		// Offset upward so piece appears above the finger
		const cell = getBoardCellFromPoint(dragX, dragY - 60);
		if (cell) {
			hoverRow = cell.row;
			hoverCol = cell.col;
			selectedPieceIndex = dragPieceIndex;
		} else {
			hoverRow = null;
			hoverCol = null;
		}
	}

	function handlePointerUp(e: PointerEvent): void {
		if (dragPieceIndex === null) return;
		e.preventDefault();
		const pieceIndex = dragPieceIndex;

		if (isDragging) {
			// Try to place piece where it was dropped
			const cell = getBoardCellFromPoint(dragX, dragY - 60);
			if (cell && pieces[pieceIndex]) {
				const piece = pieces[pieceIndex]!;
				if (canPlacePiece(piece, cell.row, cell.col)) {
					completePlacement(pieceIndex, cell.row, cell.col);
				}
			}
		} else {
			// Short tap: toggle selection (existing click behavior)
			selectPiece(pieceIndex);
		}

		dragPieceIndex = null;
		isDragging = false;
		hoverRow = null;
		hoverCol = null;
	}

	function getDragPiece(): Piece | null {
		if (dragPieceIndex === null || !isDragging) return null;
		return pieces[dragPieceIndex] ?? null;
	}

	function getHoverCells(): Set<string> {
		const activePieceIndex = isDragging ? dragPieceIndex : selectedPieceIndex;
		if (activePieceIndex === null || hoverRow === null || hoverCol === null) return new Set();
		const piece = pieces[activePieceIndex];
		if (!piece) return new Set();
		if (!canPlacePiece(piece, hoverRow, hoverCol)) return new Set();
		const cells = new Set<string>();
		for (let r = 0; r < piece.shape.length; r++) {
			for (let c = 0; c < piece.shape[r].length; c++) {
				if (piece.shape[r][c]) {
					cells.add(`${hoverRow + r},${hoverCol + c}`);
				}
			}
		}
		return cells;
	}

	function isInvalidHover(): boolean {
		const activePieceIndex = isDragging ? dragPieceIndex : selectedPieceIndex;
		if (activePieceIndex === null || hoverRow === null || hoverCol === null) return false;
		const piece = pieces[activePieceIndex];
		if (!piece) return false;
		return !canPlacePiece(piece, hoverRow, hoverCol);
	}

	function endGame(): void {
		gameOver = true;
		if (score > highScore) {
			highScore = score;
			saveHighScore();
		}
	}

	function resetGame(): void {
		board = createEmptyBoard();
		score = 0;
		gameOver = false;
		clearingCells = new Set();
		comboText = '';
		dragPieceIndex = null;
		isDragging = false;
		generatePieces();
	}

	function saveHighScore(): void {
		try { localStorage.setItem('block-blast-high-score', String(highScore)); } catch {}
	}

	function loadHighScore(): void {
		try {
			const saved = localStorage.getItem('block-blast-high-score');
			if (saved) highScore = parseInt(saved, 10) || 0;
		} catch {}
	}

	let hoverCells = $derived(getHoverCells());
	let invalidHover = $derived(isInvalidHover());
	let dragPiece = $derived(getDragPiece());

	onMount(() => {
		loadHighScore();
		resetGame();
	});

	function getActivePieceColor(): string {
		const idx = isDragging ? dragPieceIndex : selectedPieceIndex;
		if (idx === null) return '';
		const piece = pieces[idx];
		return piece ? piece.color : '';
	}
</script>

<svelte:head>
	<title>Block Blast</title>
</svelte:head>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="game-container" onpointermove={handlePointerMove} onpointerup={handlePointerUp}>
	<div class="header">
		<h1>Block Blast</h1>
		<div class="scores">
			<div class="score-box">
				<span class="score-label">Score</span>
				<span class="score-value">{score}</span>
			</div>
			<div class="score-box high">
				<span class="score-label">Best</span>
				<span class="score-value">{highScore}</span>
			</div>
		</div>
	</div>

	{#if comboText}
		<div class="combo-text">{comboText}</div>
	{/if}

	<div class="game-layout">
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="board" bind:this={boardEl} onmouseleave={handleBoardLeave}>
			{#each board as row, r}
				{#each row as cell, c}
					{@const key = `${r},${c}`}
					{@const isClearing = clearingCells.has(key)}
					{@const isHover = hoverCells.has(key)}
					<!-- svelte-ignore a11y_consider_explicit_label -->
					<button
						class="cell"
						class:filled={cell !== null}
						class:clearing={isClearing}
						class:hover-preview={isHover}
						class:invalid-hover={invalidHover && (selectedPieceIndex !== null || dragPieceIndex !== null) && hoverRow !== null}
						style:background-color={isClearing ? '#fff' : isHover ? getActivePieceColor() : cell || ''}
						style:opacity={isHover && !cell ? '0.5' : '1'}
						onclick={() => handleBoardClick(r, c)}
						onmouseenter={() => handleBoardHover(r, c)}
					></button>
				{/each}
			{/each}
		</div>

		<div class="pieces-area">
			<p class="pieces-label">
				{#if isDragging}
					Drag onto the board
				{:else if selectedPieceIndex !== null}
					Tap the board to place
				{:else}
					Drag or tap a piece
				{/if}
			</p>
			<div class="pieces-row">
				{#each pieces as piece, i}
					<button
						class="piece-container"
						class:selected={selectedPieceIndex === i && !isDragging}
						class:dragging={dragPieceIndex === i && isDragging}
						class:used={piece === null}
						onpointerdown={(e) => handlePiecePointerDown(e, i)}
						disabled={piece === null}
					>
						{#if piece}
							<div class="piece-grid" style:grid-template-columns={`repeat(${piece.shape[0].length}, 1fr)`}>
								{#each piece.shape as row}
									{#each row as cell}
										<div
											class="piece-cell"
											class:piece-filled={cell}
											style:background-color={cell ? piece.color : 'transparent'}
										></div>
									{/each}
								{/each}
							</div>
						{/if}
					</button>
				{/each}
			</div>
		</div>
	</div>

	{#if dragPiece}
		<div class="drag-ghost" style:left="{dragX}px" style:top="{dragY - 60}px">
			<div class="piece-grid" style:grid-template-columns={`repeat(${dragPiece.shape[0].length}, 1fr)`}>
				{#each dragPiece.shape as row}
					{#each row as cell}
						<div
							class="piece-cell drag-cell"
							class:piece-filled={cell}
							style:background-color={cell ? dragPiece.color : 'transparent'}
						></div>
					{/each}
				{/each}
			</div>
		</div>
	{/if}

	{#if gameOver}
		<div class="game-over-overlay">
			<div class="game-over-card">
				<h2>Game Over!</h2>
				<p class="final-score">Score: {score}</p>
				{#if score >= highScore && score > 0}
					<p class="new-best">New Best!</p>
				{/if}
				<button class="restart-btn" onclick={resetGame}>Play Again</button>
			</div>
		</div>
	{/if}

	<div class="back-link">
		<a href="/">Back to Home</a>
	</div>
</div>

<style>
	.game-container {
		max-width: 500px;
		margin: 0 auto;
		padding: 1.5rem 1rem;
		font-family: system-ui, -apple-system, sans-serif;
		min-height: 100vh;
		background: linear-gradient(135deg, #1a1a3e 0%, #2d1b69 50%, #1a1a3e 100%);
		color: #fff;
		position: relative;
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
	}

	h1 {
		font-size: 1.8rem;
		margin: 0;
		background: linear-gradient(90deg, #f1c40f, #e67e22);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.scores {
		display: flex;
		gap: 0.75rem;
	}

	.score-box {
		background: rgba(255,255,255,0.1);
		border-radius: 10px;
		padding: 0.4rem 0.8rem;
		text-align: center;
		min-width: 60px;
	}

	.score-box.high {
		background: rgba(241,196,15,0.15);
	}

	.score-label {
		display: block;
		font-size: 0.7rem;
		text-transform: uppercase;
		opacity: 0.7;
		letter-spacing: 0.05em;
	}

	.score-value {
		display: block;
		font-size: 1.3rem;
		font-weight: 700;
	}

	.combo-text {
		text-align: center;
		font-size: 1.2rem;
		font-weight: 700;
		color: #f1c40f;
		animation: combo-pop 0.3s ease-out;
		margin-bottom: 0.5rem;
	}

	@keyframes combo-pop {
		0% { transform: scale(0.5); opacity: 0; }
		50% { transform: scale(1.2); }
		100% { transform: scale(1); opacity: 1; }
	}

	.game-layout {
		display: flex;
		flex-direction: column;
	}

	.board {
		display: grid;
		grid-template-columns: repeat(8, 1fr);
		gap: 2px;
		background: rgba(255,255,255,0.08);
		border-radius: 12px;
		padding: 6px;
		margin: 0 auto 1.5rem;
		aspect-ratio: 1;
		max-width: 400px;
		width: 100%;
	}

	.cell {
		aspect-ratio: 1;
		border-radius: 4px;
		border: 1px solid rgba(255,255,255,0.08);
		background-color: rgba(255,255,255,0.04);
		cursor: pointer;
		transition: background-color 0.1s, transform 0.1s;
		padding: 0;
		touch-action: none;
	}

	.cell.filled {
		border-color: rgba(0,0,0,0.2);
		box-shadow: inset 0 -2px 0 rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.2);
	}

	.cell.clearing {
		animation: clear-flash 0.3s ease-out;
		background-color: #fff !important;
	}

	@keyframes clear-flash {
		0% { transform: scale(1); }
		50% { transform: scale(1.1); background-color: #fff; }
		100% { transform: scale(1); opacity: 0; }
	}

	.cell.hover-preview {
		border-color: rgba(255,255,255,0.4);
		transform: scale(1.05);
	}

	.pieces-area {
		text-align: center;
	}

	.pieces-label {
		font-size: 0.85rem;
		opacity: 0.7;
		margin: 0 0 0.75rem;
	}

	.pieces-row {
		display: flex;
		justify-content: center;
		gap: 1rem;
	}

	.piece-container {
		background: rgba(255,255,255,0.06);
		border: 2px solid rgba(255,255,255,0.1);
		border-radius: 10px;
		padding: 12px;
		cursor: pointer;
		transition: all 0.2s;
		min-width: 80px;
		min-height: 80px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: inherit;
		touch-action: none;
	}

	.piece-container:hover:not(:disabled) {
		border-color: rgba(255,255,255,0.3);
		background: rgba(255,255,255,0.1);
	}

	.piece-container.selected {
		border-color: #f1c40f;
		box-shadow: 0 0 15px rgba(241,196,15,0.4);
		background: rgba(241,196,15,0.1);
	}

	.piece-container.dragging {
		opacity: 0.3;
		transform: scale(0.9);
	}

	.piece-container.used {
		opacity: 0.2;
		cursor: default;
	}

	.piece-grid {
		display: grid;
		gap: 2px;
	}

	.piece-cell {
		width: 16px;
		height: 16px;
		border-radius: 3px;
	}

	.piece-filled {
		box-shadow: inset 0 -1px 0 rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.2);
	}

	/* Drag ghost that follows the pointer */
	.drag-ghost {
		position: fixed;
		pointer-events: none;
		z-index: 200;
		transform: translate(-50%, -50%);
		opacity: 0.85;
	}

	.drag-ghost .piece-grid {
		gap: 3px;
	}

	.drag-cell {
		width: 28px;
		height: 28px;
		border-radius: 4px;
	}

	.game-over-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0,0,0,0.7);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
		animation: fade-in 0.3s ease-out;
	}

	@keyframes fade-in {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	.game-over-card {
		background: linear-gradient(135deg, #2d1b69, #1a1a3e);
		border: 2px solid rgba(241,196,15,0.3);
		border-radius: 16px;
		padding: 2rem 3rem;
		text-align: center;
	}

	.game-over-card h2 {
		font-size: 2rem;
		margin: 0 0 0.5rem;
		color: #e74c3c;
	}

	.final-score {
		font-size: 1.5rem;
		font-weight: 700;
		margin: 0.5rem 0;
	}

	.new-best {
		color: #f1c40f;
		font-weight: 700;
		font-size: 1.1rem;
		margin: 0.25rem 0 0.75rem;
	}

	.restart-btn {
		padding: 0.75rem 2rem;
		font-size: 1.1rem;
		font-weight: 700;
		color: #1a1a3e;
		background: linear-gradient(90deg, #f1c40f, #e67e22);
		border: none;
		border-radius: 10px;
		cursor: pointer;
		margin-top: 0.5rem;
		transition: transform 0.1s;
	}

	.restart-btn:hover {
		transform: scale(1.05);
	}

	.back-link {
		margin-top: 2rem;
		text-align: center;
	}

	.back-link a {
		color: rgba(255,255,255,0.6);
		text-decoration: none;
		font-size: 0.9rem;
	}

	.back-link a:hover {
		color: #fff;
		text-decoration: underline;
	}

	/* Landscape layout for tablets (iPad) */
	@media (min-width: 700px) and (orientation: landscape) {
		.game-container {
			max-width: 100%;
			padding: 1rem 2rem;
			min-height: 100vh;
			display: flex;
			flex-direction: column;
		}

		.header {
			margin-bottom: 0.75rem;
		}

		.game-layout {
			flex-direction: row;
			align-items: center;
			justify-content: center;
			gap: 2rem;
			flex: 1;
		}

		.board {
			max-width: min(55vh, 500px);
			margin: 0;
			flex-shrink: 0;
		}

		.pieces-area {
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			min-width: 160px;
		}

		.pieces-row {
			flex-direction: column;
			gap: 1.25rem;
		}

		.piece-container {
			min-width: 100px;
			min-height: 100px;
			padding: 14px;
		}

		.piece-cell {
			width: 20px;
			height: 20px;
		}

		.back-link {
			margin-top: 1rem;
		}
	}

	/* Extra large landscape (desktop / large iPad) */
	@media (min-width: 1024px) and (orientation: landscape) {
		.game-layout {
			gap: 3rem;
		}

		.board {
			max-width: min(65vh, 550px);
		}

		.piece-container {
			min-width: 120px;
			min-height: 120px;
			padding: 16px;
		}

		.piece-cell {
			width: 22px;
			height: 22px;
		}

		.drag-cell {
			width: 34px;
			height: 34px;
		}
	}
</style>
