<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	// ── Types ─────────────────────────────────────────────────────────────────
	type Dir = 'N' | 'S' | 'E' | 'W';
	type TileType =
		| 'empty'
		| 'rail-h' | 'rail-v'
		| 'curve-ne' | 'curve-nw' | 'curve-se' | 'curve-sw'
		| 'road-h' | 'road-v' | 'road-cross'
		| 'crossing-rh' | 'crossing-rv'
		| 'city'
		| 'station-h' | 'station-v'
		| 'river-h' | 'river-v' | 'lake'
		| 'bridge-short-h' | 'bridge-short-v'
		| 'bridge-long-h' | 'bridge-long-v';

	type Tool = TileType | 'eraser' | 'city-block' | 'add-train';

	interface PathStep {
		col: number; row: number;
		enteredFrom: Dir; exitDir: Dir;
		progress: number; // 0-1 snapshot at time of step start
	}

	interface Train {
		id: number;
		color: string;
		col: number; row: number;
		progress: number;
		enteredFrom: Dir;
		exitDir: Dir;
		pathHistory: PathStep[];
		speed: number;
		doubleSided: boolean;
		stopped: boolean;
		numCars: number;
		reversing: boolean;
	}

	// ── Constants ─────────────────────────────────────────────────────────────
	const COLS = 30;
	const ROWS = 20;
	const CELL = 40;
	const MAX_PATH = 60; // path steps to keep for tail drawing
	const TRAIN_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c'];

	const OPPOSITE: Record<Dir, Dir> = { N: 'S', S: 'N', E: 'W', W: 'E' };
	const DIR_DELTA: Record<Dir, [number, number]> = {
		N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0]
	};

	// Rail connections: [sideA, sideB] — train entering from sideA exits sideB and vice-versa
	const RAIL_CONN: Partial<Record<TileType, [Dir, Dir]>> = {
		'rail-h': ['W', 'E'],
		'rail-v': ['N', 'S'],
		'curve-ne': ['N', 'E'],
		'curve-nw': ['N', 'W'],
		'curve-se': ['S', 'E'],
		'curve-sw': ['S', 'W'],
		'crossing-rh': ['W', 'E'],
		'crossing-rv': ['N', 'S'],
		'station-h': ['W', 'E'],
		'station-v': ['N', 'S'],
		'bridge-short-h': ['W', 'E'],
		'bridge-short-v': ['N', 'S'],
		'bridge-long-h': ['W', 'E'],
		'bridge-long-v': ['N', 'S'],
	};

	// City block stamp (5×5)
	const CITY_STAMP: TileType[][] = [
		['road-cross','road-h','road-h','road-h','road-cross'],
		['road-v','city','city','city','road-v'],
		['road-v','city','city','city','road-v'],
		['road-v','city','city','city','road-v'],
		['road-cross','road-h','road-h','road-h','road-cross'],
	];

	// Tool palette definition
	const TOOL_GROUPS = [
		{ label: 'Rail', tools: [
			{ tool: 'rail-h' as Tool, label: 'Rail ─', icon: '═' },
			{ tool: 'rail-v' as Tool, label: 'Rail │', icon: '║' },
			{ tool: 'curve-ne' as Tool, label: 'Curve ↗', icon: '╔' },
			{ tool: 'curve-nw' as Tool, label: 'Curve ↖', icon: '╗' },
			{ tool: 'curve-se' as Tool, label: 'Curve ↘', icon: '╚' },
			{ tool: 'curve-sw' as Tool, label: 'Curve ↙', icon: '╝' },
		]},
		{ label: 'Road', tools: [
			{ tool: 'road-h' as Tool, label: 'Road ─', icon: '▬' },
			{ tool: 'road-v' as Tool, label: 'Road │', icon: '▮' },
			{ tool: 'road-cross' as Tool, label: 'Intersection', icon: '✛' },
		]},
		{ label: 'Crossing', tools: [
			{ tool: 'crossing-rh' as Tool, label: 'Rail H × Road', icon: '⊕' },
			{ tool: 'crossing-rv' as Tool, label: 'Rail V × Road', icon: '⊗' },
		]},
		{ label: 'Station', tools: [
			{ tool: 'station-h' as Tool, label: 'Station ─', icon: '🚉' },
			{ tool: 'station-v' as Tool, label: 'Station │', icon: '🚉' },
		]},
		{ label: 'City', tools: [
			{ tool: 'city-block' as Tool, label: 'City Block', icon: '🏙️' },
			{ tool: 'city' as Tool, label: 'Building', icon: '🏢' },
		]},
		{ label: 'Water', tools: [
			{ tool: 'river-h' as Tool, label: 'River ─', icon: '〰' },
			{ tool: 'river-v' as Tool, label: 'River │', icon: '〽' },
			{ tool: 'lake' as Tool, label: 'Lake', icon: '💧' },
		]},
		{ label: 'Bridge', tools: [
			{ tool: 'bridge-short-h' as Tool, label: 'Short ─', icon: '🌉' },
			{ tool: 'bridge-short-v' as Tool, label: 'Short │', icon: '🌉' },
			{ tool: 'bridge-long-h' as Tool, label: 'Long ─', icon: '🌁' },
			{ tool: 'bridge-long-v' as Tool, label: 'Long │', icon: '🌁' },
		]},
		{ label: 'Other', tools: [
			{ tool: 'eraser' as Tool, label: 'Eraser', icon: '🗑️' },
			{ tool: 'add-train' as Tool, label: 'Add Train', icon: '🚂' },
		]},
	];

	// ── State ─────────────────────────────────────────────────────────────────
	let grid: TileType[][] = $state(makeGrid());
	let trains: Train[] = $state([]);
	let nextTrainId = 1;
	let colorIndex = 0;

	let selectedTool: Tool = $state('rail-h');
	let isPointerDown = $state(false);
	let lastPaintedCell = { col: -1, row: -1 };

	let running = $state(false);
	let globalSpeed = $state(2.5);

	// Train popup
	let popupTrain: Train | null = $state(null);
	let popupX = $state(0);
	let popupY = $state(0);

	// Pan state
	let panX = $state(0);
	let panY = $state(0);
	let isPanning = false;
	let panStart = { mx: 0, my: 0, px: 0, py: 0 };
	let spaceDown = $state(false);

	// Save/load
	let saveNames: string[] = $state(['', '', '']);
	let showSaveLoad = $state(false);

	// Canvas
	let canvasEl: HTMLCanvasElement | undefined = $state(undefined);
	let containerEl: HTMLDivElement | undefined = $state(undefined);
	let animFrame = 0;
	let lastTime = 0;
	let rippleOffset = 0; // for animated water

	// ── Helpers ───────────────────────────────────────────────────────────────
	function makeGrid(): TileType[][] {
		return Array.from({ length: ROWS }, () => Array(COLS).fill('empty') as TileType[]);
	}

	function getExitDir(tile: TileType, enteredFrom: Dir): Dir | null {
		const conn = RAIL_CONN[tile];
		if (!conn) return null;
		if (conn[0] === enteredFrom) return conn[1];
		if (conn[1] === enteredFrom) return conn[0];
		return null;
	}

	function isRailTile(t: TileType): boolean {
		return RAIL_CONN[t] !== undefined;
	}

	function defaultEntryDir(tile: TileType): Dir {
		const conn = RAIL_CONN[tile];
		if (!conn) return 'W';
		return OPPOSITE[conn[0]]; // enter from sideA
	}

	// ── Grid manipulation ─────────────────────────────────────────────────────
	function paintCell(col: number, row: number) {
		if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return;
		if (col === lastPaintedCell.col && row === lastPaintedCell.row) return;
		lastPaintedCell = { col, row };

		if (selectedTool === 'eraser') {
			grid[row][col] = 'empty';
		} else if (selectedTool === 'city-block') {
			placeStamp(col, row, CITY_STAMP);
		} else if (selectedTool === 'add-train') {
			// handled on pointer-up click
		} else {
			grid[row][col] = selectedTool as TileType;
		}
		draw();
	}

	function placeStamp(col: number, row: number, stamp: TileType[][]) {
		const offC = Math.floor(stamp[0].length / 2);
		const offR = Math.floor(stamp.length / 2);
		for (let r = 0; r < stamp.length; r++) {
			for (let c = 0; c < stamp[0].length; c++) {
				const gr = row - offR + r;
				const gc = col - offC + c;
				if (gr >= 0 && gr < ROWS && gc >= 0 && gc < COLS) {
					grid[gr][gc] = stamp[r][c];
				}
			}
		}
	}

	// ── Train management ──────────────────────────────────────────────────────
	function addTrain(col: number, row: number) {
		const tile = grid[row][col];
		if (!isRailTile(tile)) return;
		const conn = RAIL_CONN[tile]!;
		const enteredFrom = conn[0];
		const exitDir = conn[1];
		const color = TRAIN_COLORS[colorIndex % TRAIN_COLORS.length];
		colorIndex++;
		const train: Train = {
			id: nextTrainId++,
			color,
			col, row,
			progress: 0,
			enteredFrom,
			exitDir,
			pathHistory: [],
			speed: globalSpeed,
			doubleSided: true,
			stopped: false,
			numCars: 4,
			reversing: false,
		};
		trains = [...trains, train];
	}

	function removeTrain(id: number) {
		trains = trains.filter(t => t.id !== id);
		popupTrain = null;
	}

	// ── Train movement ────────────────────────────────────────────────────────
	function stepTrain(train: Train, dt: number) {
		if (train.stopped) return;

		train.progress += dt * train.speed;

		while (train.progress >= 1) {
			train.progress -= 1;

			// Compute next cell before committing to move
			const [dc, dr] = DIR_DELTA[train.exitDir];
			const nextCol = train.col + dc;
			const nextRow = train.row + dr;

			const atEdge = nextCol < 0 || nextCol >= COLS || nextRow < 0 || nextRow >= ROWS;
			const nextEntry = OPPOSITE[train.exitDir];
			const nextExit = atEdge ? null : getExitDir(grid[nextRow][nextCol], nextEntry);

			if (atEdge || nextExit === null) {
				// Dead end — don't add this step to history since we didn't move
				if (train.doubleSided) {
					// Check if the reversed direction is also blocked (isolated tile)
					const [rdc, rdr] = DIR_DELTA[train.enteredFrom];
					const rNext = grid[train.row + rdr]?.[train.col + rdc];
					const rExit = rNext ? getExitDir(rNext, OPPOSITE[train.enteredFrom]) : null;
					const rInBounds = train.col + rdc >= 0 && train.col + rdc < COLS &&
					                  train.row + rdr >= 0 && train.row + rdr < ROWS;
					if (rInBounds && rExit !== null) {
						reverseTrainDir(train);
					} else {
						train.stopped = true;
						train.progress = 0.5;
					}
				} else {
					train.stopped = true;
					train.progress = 0.99;
				}
				return;
			}

			// Confirmed move — now record the step we're leaving
			train.pathHistory.unshift({
				col: train.col, row: train.row,
				enteredFrom: train.enteredFrom, exitDir: train.exitDir,
				progress: 0,
			});
			if (train.pathHistory.length > MAX_PATH) train.pathHistory.pop();

			train.col = nextCol;
			train.row = nextRow;
			train.enteredFrom = nextEntry;
			train.exitDir = nextExit;
		}
	}

	function reverseTrainDir(train: Train) {
		// Swap entry and exit so the train goes the other way
		// (simply swap, no OPPOSITE — enteredFrom becomes exitDir and vice-versa)
		const oldEntry = train.enteredFrom;
		train.enteredFrom = train.exitDir;
		train.exitDir = oldEntry;
		train.progress = Math.min(0.99, 1 - train.progress);
		train.reversing = !train.reversing;
	}

	// ── Canvas drawing ────────────────────────────────────────────────────────
	function draw() {
		if (!canvasEl) return;
		const ctx = canvasEl.getContext('2d')!;
		ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

		ctx.save();
		ctx.translate(panX, panY);

		// Draw grid tiles
		for (let r = 0; r < ROWS; r++) {
			for (let c = 0; c < COLS; c++) {
				drawTile(ctx, grid[r][c], c * CELL, r * CELL);
			}
		}

		// Draw trains
		for (const train of trains) {
			drawTrain(ctx, train);
		}

		ctx.restore();
	}

	function drawTile(ctx: CanvasRenderingContext2D, tile: TileType, x: number, y: number) {
		const C = CELL;
		const cx = x + C / 2;
		const cy = y + C / 2;

		// Background grass
		ctx.fillStyle = '#4a7c3f';
		ctx.fillRect(x, y, C, C);

		switch (tile) {
			case 'empty': break;

			case 'rail-h': {
				drawSleepers(ctx, x, y, false);
				drawRailLines(ctx, x, y, false);
				break;
			}
			case 'rail-v': {
				drawSleepers(ctx, x, y, true);
				drawRailLines(ctx, x, y, true);
				break;
			}

			case 'curve-ne': drawCurve(ctx, x, y, 'ne'); break;
			case 'curve-nw': drawCurve(ctx, x, y, 'nw'); break;
			case 'curve-se': drawCurve(ctx, x, y, 'se'); break;
			case 'curve-sw': drawCurve(ctx, x, y, 'sw'); break;

			case 'road-h': {
				ctx.fillStyle = '#777';
				ctx.fillRect(x, y + C * 0.25, C, C * 0.5);
				// Dashed center line
				ctx.strokeStyle = '#fff';
				ctx.lineWidth = 1;
				ctx.setLineDash([6, 5]);
				ctx.beginPath();
				ctx.moveTo(x, cy);
				ctx.lineTo(x + C, cy);
				ctx.stroke();
				ctx.setLineDash([]);
				break;
			}
			case 'road-v': {
				ctx.fillStyle = '#777';
				ctx.fillRect(x + C * 0.25, y, C * 0.5, C);
				ctx.strokeStyle = '#fff';
				ctx.lineWidth = 1;
				ctx.setLineDash([6, 5]);
				ctx.beginPath();
				ctx.moveTo(cx, y);
				ctx.lineTo(cx, y + C);
				ctx.stroke();
				ctx.setLineDash([]);
				break;
			}
			case 'road-cross': {
				ctx.fillStyle = '#777';
				ctx.fillRect(x, y + C * 0.25, C, C * 0.5);
				ctx.fillRect(x + C * 0.25, y, C * 0.5, C);
				// White cross lines
				ctx.strokeStyle = '#aaa';
				ctx.lineWidth = 1;
				ctx.beginPath();
				ctx.moveTo(x, cy); ctx.lineTo(x + C, cy);
				ctx.moveTo(cx, y); ctx.lineTo(cx, y + C);
				ctx.stroke();
				break;
			}

			case 'crossing-rh': {
				// Road goes vertical, rail goes horizontal
				ctx.fillStyle = '#777';
				ctx.fillRect(x + C * 0.25, y, C * 0.5, C);
				drawSleepers(ctx, x, y, false);
				drawRailLines(ctx, x, y, false);
				// Warning stripes
				drawCrossingStripes(ctx, x, y, false);
				break;
			}
			case 'crossing-rv': {
				// Road goes horizontal, rail goes vertical
				ctx.fillStyle = '#777';
				ctx.fillRect(x, y + C * 0.25, C, C * 0.5);
				drawSleepers(ctx, x, y, true);
				drawRailLines(ctx, x, y, true);
				drawCrossingStripes(ctx, x, y, true);
				break;
			}

			case 'city': {
				// Building
				ctx.fillStyle = '#555';
				ctx.fillRect(x + 1, y + 1, C - 2, C - 2);
				// Windows
				ctx.fillStyle = '#f1c40f';
				for (let wr = 0; wr < 3; wr++) {
					for (let wc = 0; wc < 3; wc++) {
						if ((wr + wc) % 2 === 0) {
							ctx.fillRect(x + 5 + wc * 11, y + 5 + wr * 11, 7, 7);
						}
					}
				}
				break;
			}

			case 'station-h': {
				// Platform (gray slab)
				ctx.fillStyle = '#aaa';
				ctx.fillRect(x, y + C * 0.2, C, C * 0.6);
				// Yellow edge stripe
				ctx.fillStyle = '#f1c40f';
				ctx.fillRect(x, y + C * 0.2, C, 3);
				ctx.fillRect(x, y + C * 0.8 - 3, C, 3);
				// Rails on top
				drawRailLines(ctx, x, y, false);
				break;
			}
			case 'station-v': {
				ctx.fillStyle = '#aaa';
				ctx.fillRect(x + C * 0.2, y, C * 0.6, C);
				ctx.fillStyle = '#f1c40f';
				ctx.fillRect(x + C * 0.2, y, 3, C);
				ctx.fillRect(x + C * 0.8 - 3, y, 3, C);
				drawRailLines(ctx, x, y, true);
				break;
			}

			case 'river-h': {
				ctx.fillStyle = '#2980b9';
				ctx.fillRect(x, y, C, C);
				drawRipples(ctx, x, y, false);
				break;
			}
			case 'river-v': {
				ctx.fillStyle = '#2980b9';
				ctx.fillRect(x, y, C, C);
				drawRipples(ctx, x, y, true);
				break;
			}
			case 'lake': {
				ctx.fillStyle = '#1a5276';
				ctx.fillRect(x, y, C, C);
				// subtle ripple
				ctx.strokeStyle = 'rgba(255,255,255,0.15)';
				ctx.lineWidth = 1;
				ctx.setLineDash([]);
				ctx.beginPath();
				ctx.arc(cx + Math.sin(rippleOffset * 0.5) * 4, cy, 8, 0, Math.PI);
				ctx.stroke();
				break;
			}

			case 'bridge-short-h': {
				// River below
				ctx.fillStyle = '#2980b9';
				ctx.fillRect(x, y, C, C);
				// Wood deck
				ctx.fillStyle = '#8B6914';
				ctx.fillRect(x, y + C * 0.3, C, C * 0.4);
				// Side railings
				ctx.fillStyle = '#5D4037';
				ctx.fillRect(x, y + C * 0.3, C, 3);
				ctx.fillRect(x, y + C * 0.7 - 3, C, 3);
				drawRailLines(ctx, x, y, false);
				break;
			}
			case 'bridge-short-v': {
				ctx.fillStyle = '#2980b9';
				ctx.fillRect(x, y, C, C);
				ctx.fillStyle = '#8B6914';
				ctx.fillRect(x + C * 0.3, y, C * 0.4, C);
				ctx.fillStyle = '#5D4037';
				ctx.fillRect(x + C * 0.3, y, 3, C);
				ctx.fillRect(x + C * 0.7 - 3, y, 3, C);
				drawRailLines(ctx, x, y, true);
				break;
			}
			case 'bridge-long-h': {
				// Lake below
				ctx.fillStyle = '#1a5276';
				ctx.fillRect(x, y, C, C);
				// Tall concrete piers
				ctx.fillStyle = '#888';
				ctx.fillRect(x + 4, y + C * 0.5, 6, C * 0.5);
				ctx.fillRect(x + C - 10, y + C * 0.5, 6, C * 0.5);
				// Bridge deck
				ctx.fillStyle = '#999';
				ctx.fillRect(x, y + C * 0.3, C, C * 0.15);
				// Rail
				drawRailLines(ctx, x, y, false);
				break;
			}
			case 'bridge-long-v': {
				ctx.fillStyle = '#1a5276';
				ctx.fillRect(x, y, C, C);
				ctx.fillStyle = '#888';
				ctx.fillRect(x + C * 0.5, y + 4, C * 0.5, 6);
				ctx.fillRect(x + C * 0.5, y + C - 10, C * 0.5, 6);
				ctx.fillStyle = '#999';
				ctx.fillRect(x + C * 0.3, y, C * 0.15, C);
				drawRailLines(ctx, x, y, true);
				break;
			}
		}

		// Grid border
		ctx.strokeStyle = 'rgba(255,255,255,0.06)';
		ctx.lineWidth = 0.5;
		ctx.strokeRect(x, y, C, C);
	}

	function drawSleepers(ctx: CanvasRenderingContext2D, x: number, y: number, vertical: boolean) {
		ctx.fillStyle = '#8B6914';
		if (!vertical) {
			for (let i = 4; i < CELL; i += 8) {
				ctx.fillRect(x + i, y + CELL * 0.3, 4, CELL * 0.4);
			}
		} else {
			for (let i = 4; i < CELL; i += 8) {
				ctx.fillRect(x + CELL * 0.3, y + i, CELL * 0.4, 4);
			}
		}
	}

	function drawRailLines(ctx: CanvasRenderingContext2D, x: number, y: number, vertical: boolean) {
		ctx.strokeStyle = '#bbb';
		ctx.lineWidth = 2;
		ctx.setLineDash([]);
		if (!vertical) {
			ctx.beginPath();
			ctx.moveTo(x, y + CELL * 0.38);
			ctx.lineTo(x + CELL, y + CELL * 0.38);
			ctx.moveTo(x, y + CELL * 0.62);
			ctx.lineTo(x + CELL, y + CELL * 0.62);
			ctx.stroke();
		} else {
			ctx.beginPath();
			ctx.moveTo(x + CELL * 0.38, y);
			ctx.lineTo(x + CELL * 0.38, y + CELL);
			ctx.moveTo(x + CELL * 0.62, y);
			ctx.lineTo(x + CELL * 0.62, y + CELL);
			ctx.stroke();
		}
	}

	function drawCurve(ctx: CanvasRenderingContext2D, x: number, y: number, corner: 'ne' | 'nw' | 'se' | 'sw') {
		const C = CELL;
		// Corner control points for bezier rails
		// corner = where the arc visually sits
		// ne: connects N (top-center) and E (right-center), arc in top-right area
		// nw: connects N (top-center) and W (left-center), arc in top-left area
		// se: connects S (bottom-center) and E (right-center), arc in bottom-right area
		// sw: connects S (bottom-center) and W (left-center), arc in bottom-left area
		type Ends = { ax: number; ay: number; bx: number; by: number; cpx: number; cpy: number };
		const ends: Record<string, Ends> = {
			'ne': { ax: x + C/2, ay: y,       bx: x + C,   by: y + C/2, cpx: x + C, cpy: y },
			'nw': { ax: x + C/2, ay: y,       bx: x,       by: y + C/2, cpx: x,     cpy: y },
			'se': { ax: x + C/2, ay: y + C,   bx: x + C,   by: y + C/2, cpx: x + C, cpy: y + C },
			'sw': { ax: x + C/2, ay: y + C,   bx: x,       by: y + C/2, cpx: x,     cpy: y + C },
		};
		const { ax, ay, bx, by, cpx, cpy } = ends[corner];

		// Draw sleepers along curve (approximate with 5 short lines)
		ctx.fillStyle = '#8B6914';
		for (let t = 0.1; t < 1; t += 0.2) {
			const qx = (1 - t) * (1 - t) * ax + 2 * (1 - t) * t * cpx + t * t * bx;
			const qy = (1 - t) * (1 - t) * ay + 2 * (1 - t) * t * cpy + t * t * by;
			// tangent
			const tx2 = 2 * (1 - t) * (cpx - ax) + 2 * t * (bx - cpx);
			const ty2 = 2 * (1 - t) * (cpy - ay) + 2 * t * (by - cpy);
			const len = Math.sqrt(tx2 * tx2 + ty2 * ty2) || 1;
			const nx = -ty2 / len * 6;
			const ny = tx2 / len * 6;
			ctx.fillRect(qx - nx / 2 - 1, qy - ny / 2 - 1, Math.abs(nx) + 2, Math.abs(ny) + 2);
		}

		// Draw two parallel rail bezier curves
		function offsetBezier(offNormal: number) {
			// We approximate by shifting control points
			const dx = bx - ax; const dy = by - ay;
			const len = Math.sqrt(dx * dx + dy * dy) || 1;
			const nx = -dy / len * offNormal;
			const ny = dx / len * offNormal;
			ctx.beginPath();
			ctx.moveTo(ax + nx, ay + ny);
			ctx.quadraticCurveTo(cpx + nx, cpy + ny, bx + nx, by + ny);
			ctx.stroke();
		}

		ctx.strokeStyle = '#bbb';
		ctx.lineWidth = 2;
		ctx.setLineDash([]);
		offsetBezier(-5);
		offsetBezier(5);
	}

	function drawCrossingStripes(ctx: CanvasRenderingContext2D, x: number, y: number, railVertical: boolean) {
		ctx.strokeStyle = '#f1c40f';
		ctx.lineWidth = 2;
		if (!railVertical) {
			// Rail is horizontal, road is vertical → stripes on left/right road edges
			ctx.beginPath();
			ctx.moveTo(x + CELL * 0.25, y + 2);
			ctx.lineTo(x + CELL * 0.25, y + CELL - 2);
			ctx.moveTo(x + CELL * 0.75, y + 2);
			ctx.lineTo(x + CELL * 0.75, y + CELL - 2);
			ctx.stroke();
		} else {
			ctx.beginPath();
			ctx.moveTo(x + 2, y + CELL * 0.25);
			ctx.lineTo(x + CELL - 2, y + CELL * 0.25);
			ctx.moveTo(x + 2, y + CELL * 0.75);
			ctx.lineTo(x + CELL - 2, y + CELL * 0.75);
			ctx.stroke();
		}
	}

	function drawRipples(ctx: CanvasRenderingContext2D, x: number, y: number, vertical: boolean) {
		ctx.strokeStyle = 'rgba(255,255,255,0.25)';
		ctx.lineWidth = 1;
		ctx.setLineDash([]);
		const off = (rippleOffset % 16) - 8;
		if (!vertical) {
			for (let i = 0; i < 3; i++) {
				const ry = y + CELL * 0.25 + i * CELL * 0.25 + off * 0.3;
				ctx.beginPath();
				ctx.moveTo(x + 4, ry);
				ctx.quadraticCurveTo(x + CELL / 2, ry - 4, x + CELL - 4, ry);
				ctx.stroke();
			}
		} else {
			for (let i = 0; i < 3; i++) {
				const rx = x + CELL * 0.25 + i * CELL * 0.25 + off * 0.3;
				ctx.beginPath();
				ctx.moveTo(rx, y + 4);
				ctx.quadraticCurveTo(rx - 4, y + CELL / 2, rx, y + CELL - 4);
				ctx.stroke();
			}
		}
	}

	// ── Train position interpolation ──────────────────────────────────────────
	function getTileCarPos(col: number, row: number, enteredFrom: Dir, exitDir: Dir, t: number): [number, number, number] {
		// Returns [worldX, worldY, angleDeg]
		const C = CELL;
		const bx = col * C;
		const by = row * C;
		const cx = bx + C / 2;
		const cy = by + C / 2;

		const sidePoint = (d: Dir): [number, number] => {
			switch (d) {
				case 'N': return [cx, by];
				case 'S': return [cx, by + C];
				case 'E': return [bx + C, cy];
				case 'W': return [bx, cy];
			}
		};

		const [x0, y0] = sidePoint(enteredFrom);
		const [x1, y1] = sidePoint(exitDir);

		// Check if it's a curve tile (non-straight)
		const isCurve = enteredFrom !== OPPOSITE[exitDir];

		let wx: number, wy: number, angle: number;
		if (!isCurve) {
			// Straight: linear interpolation
			wx = x0 + (x1 - x0) * t;
			wy = y0 + (y1 - y0) * t;
			const dx = x1 - x0; const dy = y1 - y0;
			angle = Math.atan2(dy, dx) * 180 / Math.PI;
		} else {
			// Curved: quadratic bezier
			// control point = corner of the curve
			let cpx: number;
			let cpy: number;
			switch (exitDir) {
				case 'N': cpx = x0; cpy = y1; break;
				case 'S': cpx = x0; cpy = y1; break;
				case 'E': cpx = x1; cpy = y0; break;
				case 'W': cpx = x1; cpy = y0; break;
				default: cpx = (x0 + x1) / 2; cpy = (y0 + y1) / 2; break;
			}
			const u = t;
			const v = 1 - u;
			wx = v * v * x0 + 2 * v * u * cpx + u * u * x1;
			wy = v * v * y0 + 2 * v * u * cpy + u * u * y1;
			// Tangent
			const tdx = 2 * v * (cpx - x0) + 2 * u * (x1 - cpx);
			const tdy = 2 * v * (cpy - y0) + 2 * u * (y1 - cpy);
			angle = Math.atan2(tdy, tdx) * 180 / Math.PI;
		}

		return [wx, wy, angle];
	}

	function getCarPosition(train: Train, carIndex: number): [number, number, number] | null {
		// carIndex 0 = head, 1,2,3... = trailing cars
		// Each car is 0.8 tiles behind the previous
		const carSpacing = 0.8;
		const totalOffset = carIndex * carSpacing;

		// Build a list of path segments: current + history
		const segments: { col: number; row: number; enteredFrom: Dir; exitDir: Dir }[] = [
			{ col: train.col, row: train.row, enteredFrom: train.enteredFrom, exitDir: train.exitDir },
			...train.pathHistory,
		];

		let remaining = totalOffset;
		let localProgress = train.progress;

		for (const seg of segments) {
			if (remaining <= localProgress) {
				const t = localProgress - remaining;
				return getTileCarPos(seg.col, seg.row, seg.enteredFrom, seg.exitDir, t);
			}
			remaining -= localProgress;
			localProgress = 1;
		}

		// Not enough history yet: clamp to last known segment
		const last = segments[segments.length - 1];
		return getTileCarPos(last.col, last.row, last.enteredFrom, last.exitDir, 0);
	}

	function drawTrain(ctx: CanvasRenderingContext2D, train: Train) {
		const carW = CELL * 0.65;
		const carH = CELL * 0.35;

		for (let i = train.numCars - 1; i >= 0; i--) {
			const pos = getCarPosition(train, i);
			if (!pos) continue;
			const [wx, wy, angle] = pos;

			ctx.save();
			ctx.translate(wx, wy);
			ctx.rotate(angle * Math.PI / 180);

			// Car body
			const isHead = i === 0;
			const isTail = i === train.numCars - 1;
			const bodyColor = isHead ? train.color : shadeColor(train.color, -20);
			ctx.fillStyle = bodyColor;
			roundRect(ctx, -carW / 2, -carH / 2, carW, carH, 4);
			ctx.fill();
			ctx.strokeStyle = 'rgba(0,0,0,0.4)';
			ctx.lineWidth = 1;
			ctx.stroke();

			// Headlights
			if (isHead) {
				ctx.fillStyle = '#fff';
				ctx.beginPath();
				ctx.arc(carW / 2 - 3, -3, 2, 0, Math.PI * 2);
				ctx.arc(carW / 2 - 3, 3, 2, 0, Math.PI * 2);
				ctx.fill();
			}
			if (isTail && train.doubleSided) {
				ctx.fillStyle = '#fff';
				ctx.beginPath();
				ctx.arc(-carW / 2 + 3, -3, 2, 0, Math.PI * 2);
				ctx.arc(-carW / 2 + 3, 3, 2, 0, Math.PI * 2);
				ctx.fill();
			}

			// Chimney on head
			if (isHead) {
				ctx.fillStyle = '#222';
				ctx.fillRect(-carW / 2 + 4, -carH / 2 - 4, 5, 4);
			}

			ctx.restore();
		}
	}

	function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
		ctx.beginPath();
		ctx.moveTo(x + r, y);
		ctx.lineTo(x + w - r, y);
		ctx.arcTo(x + w, y, x + w, y + r, r);
		ctx.lineTo(x + w, y + h - r);
		ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
		ctx.lineTo(x + r, y + h);
		ctx.arcTo(x, y + h, x, y + h - r, r);
		ctx.lineTo(x, y + r);
		ctx.arcTo(x, y, x + r, y, r);
		ctx.closePath();
	}

	function shadeColor(color: string, amount: number): string {
		const num = parseInt(color.slice(1), 16);
		const r = Math.min(255, Math.max(0, (num >> 16) + amount));
		const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount));
		const b = Math.min(255, Math.max(0, (num & 0xff) + amount));
		return `rgb(${r},${g},${b})`;
	}

	// ── Animation loop ────────────────────────────────────────────────────────
	function loop(ts: number) {
		animFrame = requestAnimationFrame(loop);
		const dt = lastTime === 0 ? 0 : Math.min((ts - lastTime) / 1000, 0.1);
		lastTime = ts;
		rippleOffset += dt * 8;

		if (running) {
			for (const train of trains) {
				stepTrain(train, dt);
			}
		}

		draw();
	}

	// ── Canvas event handling ─────────────────────────────────────────────────
	function canvasCoords(e: PointerEvent): [number, number] {
		if (!canvasEl) return [-1, -1];
		const rect = canvasEl.getBoundingClientRect();
		const wx = e.clientX - rect.left - panX;
		const wy = e.clientY - rect.top - panY;
		return [Math.floor(wx / CELL), Math.floor(wy / CELL)];
	}

	function handleCanvasPointerDown(e: PointerEvent) {
		if (!canvasEl) return;
		e.preventDefault();
		canvasEl.setPointerCapture(e.pointerId);

		if (e.button === 1 || spaceDown) {
			// Pan
			isPanning = true;
			panStart = { mx: e.clientX, my: e.clientY, px: panX, py: panY };
			return;
		}

		isPointerDown = true;
		lastPaintedCell = { col: -1, row: -1 };
		const [col, row] = canvasCoords(e);

		if (selectedTool === 'add-train') {
			// Check if clicking on an existing train
			const clickedTrain = getTrainAt(col, row);
			if (clickedTrain) {
				openPopup(clickedTrain, e.clientX, e.clientY);
			} else {
				popupTrain = null;
				addTrain(col, row);
			}
		} else {
			popupTrain = null;
			paintCell(col, row);
		}
	}

	function handleCanvasPointerMove(e: PointerEvent) {
		if (isPanning) {
			panX = panStart.px + (e.clientX - panStart.mx);
			panY = panStart.py + (e.clientY - panStart.my);
			// Clamp
			const minX = -(COLS * CELL - (containerEl?.clientWidth ?? 800) + 200);
			const minY = -(ROWS * CELL - (containerEl?.clientHeight ?? 600) + 80);
			panX = Math.min(0, Math.max(minX, panX));
			panY = Math.min(0, Math.max(minY, panY));
			draw();
			return;
		}
		if (!isPointerDown) return;
		const [col, row] = canvasCoords(e);
		if (selectedTool !== 'add-train') paintCell(col, row);
	}

	function handleCanvasPointerUp(e: PointerEvent) {
		isPanning = false;
		isPointerDown = false;
	}

	function getTrainAt(col: number, row: number): Train | null {
		// Check the clicked tile and adjacent tiles to account for visual position near tile edges
		return trains.find(t =>
			Math.abs(t.col - col) <= 1 && Math.abs(t.row - row) <= 1
		) ?? null;
	}

	function openPopup(train: Train, mx: number, my: number) {
		popupTrain = train;
		popupX = mx;
		popupY = my;
	}

	// ── Save / Load ───────────────────────────────────────────────────────────
	interface SaveSlot {
		grid: TileType[][];
		trainData: Omit<Train, 'pathHistory'>[];
		savedAt: string;
	}

	function saveToSlot(idx: number) {
		const data: SaveSlot = {
			grid: grid.map(row => [...row]),
			trainData: trains.map(t => ({
				id: t.id, color: t.color,
				col: t.col, row: t.row,
				progress: t.progress, enteredFrom: t.enteredFrom, exitDir: t.exitDir,
				speed: t.speed, doubleSided: t.doubleSided,
				stopped: t.stopped, numCars: t.numCars, reversing: t.reversing,
			})),
			savedAt: new Date().toLocaleString(),
		};
		try {
			localStorage.setItem(`train-maker-slot-${idx}`, JSON.stringify(data));
			const names = [...saveNames];
			names[idx] = data.savedAt;
			saveNames = names;
			persistSaveNames();
		} catch {}
	}

	function loadFromSlot(idx: number) {
		try {
			const raw = localStorage.getItem(`train-maker-slot-${idx}`);
			if (!raw) return;
			const data: SaveSlot = JSON.parse(raw);
			grid = data.grid;
			trains = data.trainData.map(t => ({ ...t, pathHistory: [] }));
			popupTrain = null;
			draw();
		} catch {}
	}

	function persistSaveNames() {
		try { localStorage.setItem('train-maker-save-names', JSON.stringify(saveNames)); } catch {}
	}

	function loadSaveNames() {
		try {
			const raw = localStorage.getItem('train-maker-save-names');
			if (raw) saveNames = JSON.parse(raw);
		} catch {}
	}

	function clearAll() {
		grid = makeGrid();
		trains = [];
		popupTrain = null;
		draw();
	}

	// ── Keyboard ──────────────────────────────────────────────────────────────
	function handleKeyDown(e: KeyboardEvent) {
		if (e.code === 'Space') { e.preventDefault(); spaceDown = true; }
	}
	function handleKeyUp(e: KeyboardEvent) {
		if (e.code === 'Space') spaceDown = false;
	}

	// ── Lifecycle ─────────────────────────────────────────────────────────────
	onMount(() => {
		loadSaveNames();
		if (canvasEl) {
			lastTime = performance.now();
			animFrame = requestAnimationFrame(loop);
		}
	});

	onDestroy(() => {
		if (animFrame) cancelAnimationFrame(animFrame);
	});
</script>

<svelte:head>
	<title>Train Maker</title>
</svelte:head>

<svelte:window onkeydown={handleKeyDown} onkeyup={handleKeyUp} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="page" onclick={() => { if (popupTrain) popupTrain = null; }}>
	<div class="header">
		<h1>Train Maker</h1>
		<div class="header-controls">
			<button class="ctrl-btn" class:active={running} onclick={() => running = !running}>
				{running ? '⏸ Pause' : '▶ Play'}
			</button>
			<button class="ctrl-btn" onclick={clearAll}>🗑 Clear All</button>
			<button class="ctrl-btn" onclick={(e) => { e.stopPropagation(); showSaveLoad = !showSaveLoad; }}>
				💾 Save / Load
			</button>
			<a href="/" class="back-link">← Home</a>
		</div>
	</div>

	<div class="workspace" bind:this={containerEl}>
		<!-- Toolbar -->
		<aside class="toolbar">
			{#each TOOL_GROUPS as group}
				<div class="tool-group">
					<div class="tool-group-label">{group.label}</div>
					{#each group.tools as item}
						<button
							class="tool-btn"
							class:selected={selectedTool === item.tool}
							onclick={(e) => { e.stopPropagation(); selectedTool = item.tool; popupTrain = null; }}
							title={item.label}
						>
							<span class="tool-icon">{item.icon}</span>
							<span class="tool-label">{item.label}</span>
						</button>
					{/each}
				</div>
			{/each}
		</aside>

		<!-- Canvas area -->
		<div class="canvas-area">
			<canvas
				bind:this={canvasEl}
				width={COLS * CELL}
				height={ROWS * CELL}
				class="grid-canvas"
				class:panning={spaceDown}
				onpointerdown={handleCanvasPointerDown}
				onpointermove={handleCanvasPointerMove}
				onpointerup={handleCanvasPointerUp}
			></canvas>
		</div>
	</div>

	<!-- Train popup -->
	{#if popupTrain}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="train-popup"
			style:left="{Math.min(popupX, window.innerWidth - 220)}px"
			style:top="{Math.min(popupY, window.innerHeight - 180)}px"
			onclick={(e) => e.stopPropagation()}
		>
			<div class="popup-header">
				<div class="popup-color-dot" style:background={popupTrain.color}></div>
				<span>Train #{popupTrain.id}</span>
				<button class="popup-close" onclick={() => popupTrain = null}>✕</button>
			</div>
			<label class="popup-row">
				Speed
				<input type="range" min="0.5" max="8" step="0.5"
					value={popupTrain.speed}
					oninput={(e) => { if (popupTrain) popupTrain.speed = parseFloat((e.target as HTMLInputElement).value); }}
				/>
				<span>{popupTrain.speed.toFixed(1)}x</span>
			</label>
			<label class="popup-row">
				<input type="checkbox"
					checked={popupTrain.doubleSided}
					onchange={(e) => { if (popupTrain) popupTrain.doubleSided = (e.target as HTMLInputElement).checked; }}
				/>
				Double-sided
			</label>
			<label class="popup-row">
				Cars
				<input type="range" min="1" max="8" step="1"
					value={popupTrain.numCars}
					oninput={(e) => { if (popupTrain) popupTrain.numCars = parseInt((e.target as HTMLInputElement).value); }}
				/>
				<span>{popupTrain.numCars}</span>
			</label>
			<button class="popup-remove" onclick={() => { if (popupTrain) removeTrain(popupTrain.id); }}>
				Remove Train
			</button>
		</div>
	{/if}

	<!-- Save/Load panel -->
	{#if showSaveLoad}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="modal-overlay" onclick={() => showSaveLoad = false}>
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="modal" onclick={(e) => e.stopPropagation()}>
				<div class="modal-header">
					<h2>Save / Load Railway</h2>
					<button class="popup-close" onclick={() => showSaveLoad = false}>✕</button>
				</div>
				{#each [0, 1, 2] as idx}
					<div class="save-slot">
						<span class="slot-label">
							Slot {idx + 1}
							{#if saveNames[idx]}
								<small>{saveNames[idx]}</small>
							{/if}
						</span>
						<button class="ctrl-btn small" onclick={() => saveToSlot(idx)}>Save</button>
						<button class="ctrl-btn small" disabled={!saveNames[idx]} onclick={() => { loadFromSlot(idx); showSaveLoad = false; }}>Load</button>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	:global(body) {
		margin: 0;
		overflow: hidden;
		background: #1a1a2e;
		color: #fff;
		font-family: system-ui, -apple-system, sans-serif;
	}

	.page {
		display: flex;
		flex-direction: column;
		height: 100vh;
		overflow: hidden;
	}

	.header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 1rem;
		background: rgba(0,0,0,0.4);
		border-bottom: 1px solid rgba(255,255,255,0.1);
		flex-shrink: 0;
		z-index: 10;
	}

	h1 {
		margin: 0;
		font-size: 1.4rem;
		background: linear-gradient(90deg, #f1c40f, #e67e22);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.header-controls {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.ctrl-btn {
		background: rgba(255,255,255,0.1);
		border: 1px solid rgba(255,255,255,0.2);
		border-radius: 8px;
		color: #fff;
		padding: 0.35rem 0.75rem;
		cursor: pointer;
		font-size: 0.85rem;
		transition: background 0.15s;
		white-space: nowrap;
	}
	.ctrl-btn:hover { background: rgba(255,255,255,0.2); }
	.ctrl-btn.active { background: rgba(241,196,15,0.25); border-color: #f1c40f; }
	.ctrl-btn.small { padding: 0.25rem 0.5rem; font-size: 0.8rem; }
	.ctrl-btn:disabled { opacity: 0.4; cursor: default; }

	.back-link {
		color: rgba(255,255,255,0.6);
		text-decoration: none;
		font-size: 0.85rem;
		padding: 0.35rem 0.75rem;
	}
	.back-link:hover { color: #fff; }

	.workspace {
		display: flex;
		flex: 1;
		overflow: hidden;
	}

	.toolbar {
		width: 160px;
		flex-shrink: 0;
		background: rgba(0,0,0,0.3);
		border-right: 1px solid rgba(255,255,255,0.1);
		overflow-y: auto;
		padding: 0.5rem 0;
	}

	.tool-group {
		padding: 0 0.5rem 0.25rem;
		margin-bottom: 0.25rem;
	}

	.tool-group-label {
		font-size: 0.65rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: rgba(255,255,255,0.4);
		padding: 0.25rem 0.25rem 0.2rem;
	}

	.tool-btn {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		width: 100%;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 6px;
		color: rgba(255,255,255,0.75);
		padding: 0.3rem 0.4rem;
		cursor: pointer;
		font-size: 0.78rem;
		text-align: left;
		transition: all 0.12s;
	}
	.tool-btn:hover { background: rgba(255,255,255,0.08); color: #fff; }
	.tool-btn.selected {
		background: rgba(241,196,15,0.15);
		border-color: #f1c40f;
		color: #f1c40f;
	}

	.tool-icon { font-size: 1rem; flex-shrink: 0; }
	.tool-label { font-size: 0.72rem; }

	.canvas-area {
		flex: 1;
		overflow: auto;
		background: #1a1a2e;
		display: flex;
	}

	.grid-canvas {
		display: block;
		cursor: crosshair;
		touch-action: none;
		user-select: none;
		image-rendering: pixelated;
	}
	.grid-canvas.panning { cursor: grab; }

	/* Train popup */
	.train-popup {
		position: fixed;
		background: rgba(15,8,40,0.97);
		border: 1px solid rgba(255,255,255,0.2);
		border-radius: 12px;
		padding: 0.75rem;
		min-width: 200px;
		box-shadow: 0 8px 32px rgba(0,0,0,0.5);
		z-index: 200;
	}
	.popup-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
		font-weight: 600;
	}
	.popup-color-dot {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		flex-shrink: 0;
	}
	.popup-close {
		background: none;
		border: none;
		color: rgba(255,255,255,0.5);
		cursor: pointer;
		margin-left: auto;
		font-size: 0.9rem;
		padding: 0.1rem 0.3rem;
		border-radius: 4px;
	}
	.popup-close:hover { color: #fff; background: rgba(255,255,255,0.1); }

	.popup-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8rem;
		margin-bottom: 0.5rem;
		color: rgba(255,255,255,0.85);
	}
	.popup-row input[type="range"] { flex: 1; accent-color: #f1c40f; }
	.popup-row span { min-width: 28px; text-align: right; font-size: 0.75rem; }

	.popup-remove {
		width: 100%;
		margin-top: 0.25rem;
		background: rgba(231,76,60,0.2);
		border: 1px solid rgba(231,76,60,0.4);
		border-radius: 6px;
		color: #e74c3c;
		padding: 0.3rem;
		cursor: pointer;
		font-size: 0.78rem;
		transition: background 0.15s;
	}
	.popup-remove:hover { background: rgba(231,76,60,0.35); }

	/* Save/Load modal */
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0,0,0,0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 300;
	}
	.modal {
		background: rgba(15,8,40,0.98);
		border: 1px solid rgba(255,255,255,0.2);
		border-radius: 16px;
		padding: 1.5rem;
		min-width: 320px;
		box-shadow: 0 20px 60px rgba(0,0,0,0.6);
	}
	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1rem;
	}
	.modal-header h2 {
		margin: 0;
		font-size: 1.1rem;
		color: #f1c40f;
	}
	.save-slot {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.6rem 0;
		border-bottom: 1px solid rgba(255,255,255,0.08);
	}
	.slot-label {
		flex: 1;
		font-size: 0.85rem;
	}
	.slot-label small {
		display: block;
		font-size: 0.7rem;
		color: rgba(255,255,255,0.5);
	}

	@media (max-width: 600px) {
		.toolbar { width: 120px; }
		.tool-label { display: none; }
		.tool-btn { justify-content: center; }
	}
</style>
