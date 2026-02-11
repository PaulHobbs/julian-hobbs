<script lang="ts">
	type Operation = '+' | '-' | '*' | '/';
	type ParsedExpression = {
		a: number;
		b: number;
		op: Operation;
		result: number;
	};

	type WordProblem = {
		story: string;
		schema: string;
		schemaDescription: string;
		steps: string[];
		result: number;
	};

	type PracticeStep = {
		before: string;
		after: string;
		answer: string;
	};

	type PracticeProblem = {
		story: string;
		steps: PracticeStep[];
		finalAnswer: number;
	};

	const themes = [
		{ items: 'apples', container: 'basket', containers: 'baskets', names: ['Emma', 'Liam'] },
		{ items: 'marbles', container: 'bag', containers: 'bags', names: ['Sofia', 'Noah'] },
		{ items: 'stickers', container: 'pack', containers: 'packs', names: ['Julian', 'Maya'] },
		{ items: 'cookies', container: 'jar', containers: 'jars', names: ['Olivia', 'Ethan'] },
	];

	let input = $state('');
	let solved = $state(false);
	let currentProblem = $state<WordProblem | null>(null);
	let practiceMode = $state(false);
	let currentPractice = $state<PracticeProblem | null>(null);
	let practiceAnswers = $state<string[]>([]);
	let practiceChecked = $state(false);

	function parseExpression(expr: string): ParsedExpression | null {
		const cleaned = expr.trim().replace(/×/g, '*').replace(/÷/g, '/').replace(/x/gi, '*');
		const match = cleaned.match(/^(\d+(?:\.\d+)?)\s*([+\-*/])\s*(\d+(?:\.\d+)?)$/);
		if (!match) return null;

		const a = parseFloat(match[1]);
		const op = match[2] as Operation;
		const b = parseFloat(match[3]);

		let result: number;
		switch (op) {
			case '+': result = a + b; break;
			case '-': result = a - b; break;
			case '*': result = a * b; break;
			case '/': result = b !== 0 ? a / b : NaN; break;
		}

		return { a, b, op, result };
	}

	function generateWordProblem(p: ParsedExpression, themeIndex: number): WordProblem {
		const theme = themes[themeIndex % themes.length];
		const [name1, name2] = theme.names;

		switch (p.op) {
			case '+':
				return {
					story: `${name1} has ${p.a} ${theme.items}. ${name2} gives ${name1} ${p.b} more ${theme.items}. How many ${theme.items} does ${name1} have now?`,
					schema: 'Combining (Addition)',
					schemaDescription: 'Two quantities are brought together into one total. We use addition to combine them.',
					steps: additionSteps(p.a, p.b, name1, theme.items),
					result: p.result,
				};
			case '-':
				return {
					story: `${name1} has ${p.a} ${theme.items}. ${name1} gives ${p.b} ${theme.items} to ${name2}. How many ${theme.items} does ${name1} have left?`,
					schema: 'Taking Away (Subtraction)',
					schemaDescription: 'We start with a total and remove some from it. We use subtraction to find what remains.',
					steps: subtractionSteps(p.a, p.b, name1, theme.items),
					result: p.result,
				};
			case '*':
				return {
					story: `There are ${p.a} ${theme.containers}. Each ${theme.container} has ${p.b} ${theme.items} inside. How many ${theme.items} are there in total?`,
					schema: 'Equal Groups (Multiplication)',
					schemaDescription: 'We have several groups, each the same size. To find the total, we multiply the number of groups by the size of each group.',
					steps: multiplicationSteps(p.a, p.b, theme.containers, theme.container, theme.items),
					result: p.result,
				};
			case '/':
				return {
					story: `${name1} has ${p.a} ${theme.items} and wants to share them equally among ${p.b} friends. How many ${theme.items} does each friend get?`,
					schema: 'Sharing Equally (Division)',
					schemaDescription: 'We have a total that needs to be split into equal parts. We use division to find how many each part gets.',
					steps: divisionSteps(p.a, p.b, name1, theme.items),
					result: p.result,
				};
		}
	}

	function additionSteps(a: number, b: number, name: string, items: string): string[] {
		const result = a + b;
		const steps = [
			`We know: ${name} starts with ${a} ${items}.`,
			`What happens: ${name} gets ${b} more ${items}.`,
			`Operation: This is addition, so we compute ${a} + ${b}.`,
		];
		if (a >= 10 && b >= 10) {
			const aTens = Math.floor(a / 10) * 10, aOnes = a % 10;
			const bTens = Math.floor(b / 10) * 10, bOnes = b % 10;
			const sumOnes = aOnes + bOnes;
			const carry = sumOnes >= 10 ? 1 : 0;
			if (carry) {
				steps.push(`Add the ones: ${aOnes} + ${bOnes} = ${sumOnes}. Write down ${sumOnes % 10}, carry the ${carry}.`);
				steps.push(`Add the tens: ${Math.floor(a / 10)} + ${Math.floor(b / 10)} + ${carry} = ${Math.floor(a / 10) + Math.floor(b / 10) + carry}.`);
			} else {
				steps.push(`Add the ones: ${aOnes} + ${bOnes} = ${sumOnes}.`);
				steps.push(`Add the tens: ${Math.floor(a / 10)} + ${Math.floor(b / 10)} = ${Math.floor(a / 10) + Math.floor(b / 10)}.`);
			}
		}
		steps.push(`Result: ${a} + ${b} = ${result}.`);
		steps.push(`Answer: ${name} has ${result} ${items} now.`);
		return steps;
	}

	function subtractionSteps(a: number, b: number, name: string, items: string): string[] {
		const result = a - b;
		const steps = [
			`We know: ${name} starts with ${a} ${items}.`,
			`What happens: ${name} gives away ${b} ${items}.`,
			`Operation: This is subtraction, so we compute ${a} - ${b}.`,
		];
		if (a >= 10 && b >= 10) {
			const aOnes = a % 10, bOnes = b % 10;
			if (aOnes < bOnes) {
				steps.push(`The ones digit ${aOnes} is less than ${bOnes}, so we borrow from the tens.`);
				steps.push(`${a} - ${b}: borrow to get ${aOnes + 10} - ${bOnes} = ${aOnes + 10 - bOnes} in the ones place.`);
				steps.push(`Tens place: ${Math.floor(a / 10) - 1} - ${Math.floor(b / 10)} = ${Math.floor(a / 10) - 1 - Math.floor(b / 10)}.`);
			} else {
				steps.push(`Ones: ${aOnes} - ${bOnes} = ${aOnes - bOnes}.`);
				steps.push(`Tens: ${Math.floor(a / 10)} - ${Math.floor(b / 10)} = ${Math.floor(a / 10) - Math.floor(b / 10)}.`);
			}
		}
		steps.push(`Result: ${a} - ${b} = ${result}.`);
		steps.push(`Answer: ${name} has ${result} ${items} left.`);
		return steps;
	}

	function multiplicationSteps(a: number, b: number, containers: string, container: string, items: string): string[] {
		const result = a * b;
		const steps = [
			`We know: There are ${a} ${containers}, each with ${b} ${items}.`,
			`Operation: This is multiplication, so we compute ${a} × ${b}.`,
		];
		if (a <= 8) {
			const groupList = Array.from({ length: a }, (_, i) => `${container} ${i + 1} has ${b}`).join(', ');
			steps.push(`Count each group: ${groupList}.`);
			const repeated = Array(a).fill(String(b)).join(' + ');
			steps.push(`Repeated addition: ${repeated} = ${result}.`);
		} else {
			steps.push(`${a} × ${b} = ${result}.`);
		}
		steps.push(`Answer: There are ${result} ${items} in total.`);
		return steps;
	}

	function divisionSteps(a: number, b: number, name: string, items: string): string[] {
		const result = a / b;
		const isClean = Number.isInteger(result);
		const steps = [
			`We know: ${name} has ${a} ${items} to share among ${b} friends.`,
			`Operation: This is division, so we compute ${a} ÷ ${b}.`,
		];
		if (isClean && b <= 8) {
			steps.push(`Think: what number times ${b} equals ${a}?`);
			steps.push(`${b} × ${result} = ${a}. That's it!`);
		} else if (isClean) {
			steps.push(`${a} ÷ ${b} = ${result}.`);
			steps.push(`Check: ${b} × ${result} = ${a}. Correct!`);
		} else {
			const rounded = Math.round(result * 100) / 100;
			steps.push(`${a} ÷ ${b} = ${rounded}.`);
		}
		const displayResult = Number.isInteger(result) ? result : Math.round(result * 100) / 100;
		steps.push(`Answer: Each friend gets ${displayResult} ${items}.`);
		return steps;
	}

	// Practice problem generation
	function generatePracticeProblem(original: ParsedExpression): PracticeProblem {
		const themeIndex = 2; // different theme than original
		const theme = themes[themeIndex % themes.length];
		const [name1, name2] = theme.names;

		// Generate similar but different numbers
		const offset = Math.floor(Math.random() * 8) + 2;
		let newA = original.a + offset;
		let newB = original.b + Math.floor(Math.random() * 5) + 1;

		switch (original.op) {
			case '+': {
				const ans = newA + newB;
				return {
					story: `${name1} has ${newA} ${theme.items}. ${name2} gives ${name1} ${newB} more ${theme.items}. How many ${theme.items} does ${name1} have now?`,
					steps: [
						{ before: `What do we start with?`, after: theme.items, answer: String(newA) },
						{ before: `How many more does ${name1} get?`, after: theme.items, answer: String(newB) },
						{ before: `What operation do we use?`, after: `(write + - × or ÷)`, answer: '+' },
						{ before: `Solve: ${newA} + ${newB} =`, after: '', answer: String(ans) },
					],
					finalAnswer: ans,
				};
			}
			case '-': {
				if (newB > newA) newB = Math.floor(newA / 2);
				const ans = newA - newB;
				return {
					story: `${name1} has ${newA} ${theme.items}. ${name1} gives ${newB} ${theme.items} to ${name2}. How many ${theme.items} does ${name1} have left?`,
					steps: [
						{ before: `What do we start with?`, after: theme.items, answer: String(newA) },
						{ before: `How many does ${name1} give away?`, after: theme.items, answer: String(newB) },
						{ before: `What operation do we use?`, after: `(write + - × or ÷)`, answer: '-' },
						{ before: `Solve: ${newA} - ${newB} =`, after: '', answer: String(ans) },
					],
					finalAnswer: ans,
				};
			}
			case '*': {
				// keep numbers reasonable for multiplication
				newA = Math.min(newA, 12);
				newB = Math.min(newB, 12);
				const ans = newA * newB;
				return {
					story: `There are ${newA} ${theme.containers}. Each ${theme.container} has ${newB} ${theme.items} inside. How many ${theme.items} are there in total?`,
					steps: [
						{ before: `How many ${theme.containers}?`, after: '', answer: String(newA) },
						{ before: `How many ${theme.items} in each ${theme.container}?`, after: '', answer: String(newB) },
						{ before: `What operation do we use?`, after: `(write + - × or ÷)`, answer: '×' },
						{ before: `Solve: ${newA} × ${newB} =`, after: '', answer: String(ans) },
					],
					finalAnswer: ans,
				};
			}
			case '/': {
				// Make division clean
				newB = Math.max(newB, 2);
				newA = newB * (Math.floor(Math.random() * 8) + 2);
				const ans = newA / newB;
				return {
					story: `${name1} has ${newA} ${theme.items} and wants to share them equally among ${newB} friends. How many ${theme.items} does each friend get?`,
					steps: [
						{ before: `What is the total to share?`, after: theme.items, answer: String(newA) },
						{ before: `How many friends to share among?`, after: '', answer: String(newB) },
						{ before: `What operation do we use?`, after: `(write + - × or ÷)`, answer: '÷' },
						{ before: `Solve: ${newA} ÷ ${newB} =`, after: '', answer: String(ans) },
					],
					finalAnswer: ans,
				};
			}
		}
	}

	function handleSolve() {
		const p = parseExpression(input);
		if (!p) return;
		if (isNaN(p.result)) return;
		currentProblem = generateWordProblem(p, Math.floor(Math.random() * themes.length));
		solved = true;
		practiceMode = false;
		currentPractice = null;
		practiceAnswers = [];
		practiceChecked = false;
	}

	function handleTryOne() {
		const p = parseExpression(input);
		if (!p) return;
		currentPractice = generatePracticeProblem(p);
		practiceAnswers = currentPractice.steps.map(() => '');
		practiceChecked = false;
		practiceMode = true;
	}

	function checkAnswers() {
		practiceChecked = true;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') handleSolve();
	}

	function isStepCorrect(index: number): boolean {
		if (!currentPractice) return false;
		const userVal = practiceAnswers[index]?.trim();
		const correctVal = currentPractice.steps[index].answer;
		return userVal === correctVal;
	}

	let allCorrect = $derived(
		practiceChecked && currentPractice
			? currentPractice.steps.every((_, i) => isStepCorrect(i))
			: false
	);
</script>

<svelte:head>
	<title>Math Word Problem Calculator</title>
</svelte:head>

<div class="calculator">
	<h1>Math Word Problem Calculator</h1>
	<p class="subtitle">Enter an arithmetic problem and see it as a word problem!</p>

	<div class="input-section">
		<label for="expression">Type a math problem:</label>
		<div class="input-row">
			<input
				id="expression"
				type="text"
				bind:value={input}
				onkeydown={handleKeydown}
				placeholder="e.g. 24 + 13, 50 - 18, 6 * 4, 20 / 5"
			/>
			<button class="solve-btn" onclick={handleSolve}>Solve</button>
		</div>
		<p class="hint">Use +, -, *, / (or ×, ÷)</p>
	</div>

	{#if solved && currentProblem}
		<div class="results">
			<div class="card word-problem">
				<h2>Word Problem</h2>
				<p class="story">{currentProblem.story}</p>
			</div>

			<div class="card schema">
				<h2>Schema</h2>
				<p class="schema-name">{currentProblem.schema}</p>
				<p class="schema-desc">{currentProblem.schemaDescription}</p>
			</div>

			<div class="card work">
				<h2>Show Your Work</h2>
				<ol class="steps">
					{#each currentProblem.steps as step}
						<li>{step}</li>
					{/each}
				</ol>
			</div>

			<div class="practice-prompt">
				<button class="practice-btn" onclick={handleTryOne}>
					Try a Similar Problem!
				</button>
			</div>
		</div>
	{/if}

	{#if practiceMode && currentPractice}
		<div class="results">
			<div class="card practice">
				<h2>Your Turn!</h2>
				<p class="story">{currentPractice.story}</p>

				<h3>Show your work — fill in the blanks:</h3>
				<div class="practice-steps">
					{#each currentPractice.steps as step, i}
						<div class="practice-step" class:correct={practiceChecked && isStepCorrect(i)} class:incorrect={practiceChecked && !isStepCorrect(i)}>
							<span class="step-label">{step.before}</span>
							<input
								type="text"
								class="blank-input"
								bind:value={practiceAnswers[i]}
								placeholder="?"
								disabled={practiceChecked && isStepCorrect(i)}
							/>
							{#if step.after}
								<span class="step-after">{step.after}</span>
							{/if}
							{#if practiceChecked && !isStepCorrect(i)}
								<span class="feedback">Try again! Hint: re-read the problem.</span>
							{/if}
							{#if practiceChecked && isStepCorrect(i)}
								<span class="feedback correct-feedback">Correct!</span>
							{/if}
						</div>
					{/each}
				</div>

				<div class="check-row">
					<button class="check-btn" onclick={checkAnswers}>Check My Answers</button>
					{#if practiceChecked && allCorrect}
						<p class="congrats">Great job! You got them all right!</p>
					{/if}
				</div>

				<button class="practice-btn" onclick={handleTryOne} style="margin-top: 1rem;">
					Try Another One
				</button>
			</div>
		</div>
	{/if}

	<div class="back-link">
		<a href="/">Back to Home</a>
	</div>
</div>

<style>
	.calculator {
		max-width: 680px;
		margin: 0 auto;
		padding: 2rem 1.5rem;
		font-family: system-ui, -apple-system, sans-serif;
	}

	h1 {
		font-size: 1.8rem;
		margin-bottom: 0.25rem;
	}

	.subtitle {
		color: #555;
		margin-top: 0;
		margin-bottom: 2rem;
	}

	.input-section {
		margin-bottom: 2rem;
	}

	.input-section label {
		display: block;
		font-weight: 600;
		margin-bottom: 0.5rem;
		font-size: 1.1rem;
	}

	.input-row {
		display: flex;
		gap: 0.5rem;
	}

	.input-row input {
		flex: 1;
		padding: 0.75rem 1rem;
		font-size: 1.2rem;
		border: 2px solid #ccc;
		border-radius: 8px;
		font-family: 'Courier New', monospace;
	}

	.input-row input:focus {
		outline: none;
		border-color: #4a90d9;
	}

	.hint {
		font-size: 0.85rem;
		color: #888;
		margin-top: 0.4rem;
	}

	.solve-btn {
		padding: 0.75rem 1.5rem;
		font-size: 1.1rem;
		font-weight: 600;
		color: white;
		background: #4a90d9;
		border: none;
		border-radius: 8px;
		cursor: pointer;
	}

	.solve-btn:hover {
		background: #357abd;
	}

	.results {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		margin-bottom: 1.5rem;
	}

	.card {
		background: #f9f9fb;
		border: 1px solid #e0e0e0;
		border-radius: 10px;
		padding: 1.25rem 1.5rem;
	}

	.card h2 {
		margin-top: 0;
		font-size: 1.2rem;
		margin-bottom: 0.75rem;
	}

	.word-problem {
		border-left: 4px solid #4a90d9;
	}

	.story {
		font-size: 1.15rem;
		line-height: 1.6;
	}

	.schema {
		border-left: 4px solid #e8a838;
	}

	.schema-name {
		font-weight: 700;
		font-size: 1.1rem;
		color: #b37d1a;
		margin-bottom: 0.3rem;
	}

	.schema-desc {
		color: #555;
		line-height: 1.5;
	}

	.work {
		border-left: 4px solid #5ab85a;
	}

	.steps {
		padding-left: 1.25rem;
		line-height: 1.8;
	}

	.steps li {
		margin-bottom: 0.3rem;
	}

	.practice {
		border-left: 4px solid #a855f7;
	}

	.practice h3 {
		font-size: 1rem;
		margin-bottom: 1rem;
		color: #6b21a8;
	}

	.practice-prompt {
		text-align: center;
	}

	.practice-btn {
		padding: 0.7rem 1.5rem;
		font-size: 1rem;
		font-weight: 600;
		color: white;
		background: #a855f7;
		border: none;
		border-radius: 8px;
		cursor: pointer;
	}

	.practice-btn:hover {
		background: #9333ea;
	}

	.practice-steps {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
		margin-bottom: 1.25rem;
	}

	.practice-step {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		border-radius: 6px;
		background: #f3f0ff;
	}

	.practice-step.correct {
		background: #ecfdf5;
	}

	.practice-step.incorrect {
		background: #fef2f2;
	}

	.step-label {
		font-weight: 500;
	}

	.step-after {
		color: #666;
	}

	.blank-input {
		width: 70px;
		padding: 0.4rem 0.5rem;
		font-size: 1.1rem;
		text-align: center;
		border: 2px dashed #a855f7;
		border-radius: 6px;
		background: white;
		font-family: 'Courier New', monospace;
	}

	.blank-input:focus {
		outline: none;
		border-color: #7c3aed;
		border-style: solid;
	}

	.blank-input:disabled {
		background: #ecfdf5;
		border-color: #5ab85a;
		border-style: solid;
		color: #166534;
	}

	.feedback {
		font-size: 0.85rem;
		color: #dc2626;
		width: 100%;
	}

	.correct-feedback {
		color: #16a34a;
	}

	.check-btn {
		padding: 0.6rem 1.25rem;
		font-size: 1rem;
		font-weight: 600;
		color: white;
		background: #5ab85a;
		border: none;
		border-radius: 8px;
		cursor: pointer;
	}

	.check-btn:hover {
		background: #4a9e4a;
	}

	.check-row {
		display: flex;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.congrats {
		font-weight: 700;
		color: #16a34a;
		font-size: 1.1rem;
	}

	.back-link {
		margin-top: 2rem;
		padding-top: 1rem;
		border-top: 1px solid #e0e0e0;
	}

	.back-link a {
		color: #4a90d9;
		text-decoration: none;
	}

	.back-link a:hover {
		text-decoration: underline;
	}
</style>
