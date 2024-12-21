import { Reflect } from "@flamework/core";
import { Constructor } from "@flamework/core/out/utility";
import { StringBuilder } from "@rbxts/string-builder";
import { getDescendantsOfType } from "@rbxts/instance-utility";
import { flatten, reverse } from "@rbxts/array-utils";
import Object from "@rbxts/object-utils";

import { type Maybe, Meta } from "./common";
import repr from "@rbxts/repr";

type TestClassInstance = Record<string, Callback>;

interface TestCaseResult {
	readonly errorMessage?: string;
	readonly timeElapsed: number;
	readonly inputs?: unknown[];
}

interface TestRunOptions {
	readonly reporter: (testResults: string) => void;
	readonly colors: boolean;
}

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";
const DEFAULT_TEST_RUN_OPTIONS: TestRunOptions = {
	reporter: print,
	colors: false
};

class TestRunner {
	private readonly testClasses: [Constructor<TestClassInstance>, TestClassInstance][];
	private results = new Map<Constructor, Record<string, TestCaseResult>>;
	private failedTests = 0;
	private passedTests = 0;

	public constructor(...roots: Instance[]) {
		this.testClasses = flatten(roots.map(root => getDescendantsOfType(root, "ModuleScript")))
			.map(module => {
				const TestClass = <Constructor<TestClassInstance>>require(module);
				(<any>TestClass).__moduleInstance = module;
				(<any>TestClass).__isNested = module.Parent !== undefined && !roots.includes(module.Parent);
				return [TestClass, new TestClass];
			});
	}

	public async run(options: Partial<TestRunOptions> = DEFAULT_TEST_RUN_OPTIONS): Promise<void> {
		this.results = new Map;

		const { reporter, colors }: TestRunOptions = Object.assign({}, DEFAULT_TEST_RUN_OPTIONS, options);
		const start = os.clock();
		for (const [TestClass, testClass] of this.testClasses) {
			const properties = Reflect.getProperties(TestClass);
			const factNames = properties.filter(property => Reflect.hasMetadata(TestClass, Meta.Fact, property))
			const theoryNames = properties.filter(property => Reflect.hasMetadata(TestClass, Meta.Theory, property));

			const fail = (exception: unknown, name: string, { timeElapsed, inputs }: Omit<TestCaseResult, "errorMessage">): void => {
				this.failedTests++;

				let classResults = this.results.get(TestClass);
				if (classResults === undefined)
					classResults = this.results.set(TestClass, {}).get(TestClass)!;

				classResults[name] = {
					errorMessage: tostring(exception),
					timeElapsed,
					inputs
				};
			}
			const pass = (name: string, { timeElapsed, inputs }: Omit<TestCaseResult, "errorMessage">): void => {
				this.passedTests++;
				let classResults = this.results.get(TestClass);
				if (classResults === undefined)
					classResults = this.results.set(TestClass, {}).get(TestClass)!;

				classResults[name] = { timeElapsed, inputs };
			}
			const runTestCase = async (testCase: Callback, name: string, args?: unknown[]): Promise<boolean> => {
				const start = os.clock();
				try {
					await testCase(testClass, ...args ?? []);
				} catch (e) {
					const timeElapsed = os.clock() - start;
					fail(e, name, { timeElapsed, inputs: args });
					return false;
				}

				const timeElapsed = os.clock() - start;
				pass(name, { timeElapsed, inputs: args });
				return true;
			};

			for (const factName of factNames) {
				const fact = testClass[factName];
				if (!await runTestCase(fact, factName)) continue;
			}

			for (const theoryName of theoryNames) {
				const testCases = <Maybe<unknown[][]>>Reflect.getMetadata(TestClass, Meta.TestData, theoryName);
				if (testCases === undefined)
					throw `No data was provided to Theory test "${theoryName}"`;

				const theory = testClass[theoryName];
				for (const args of reverse(testCases))
					if (!await runTestCase(theory, theoryName, args)) continue;
			}
		}

		const elapsedTime = os.clock() - start;
		reporter(this.generateOutput(elapsedTime, colors));
	}

	private generateOutput(elapsedTime: number, colors: boolean): string {
		const results = new StringBuilder;
		let indent = 0;

		const appendIndent = () => results.append("  ".rep(indent));
		const getSymbol = (passed: boolean) => colors ?
			(passed ? "+" : "x")
			: passed ? `${GREEN}+${RESET}` : `${RED}x${RESET}`;

		for (const [TestClass, testCaseRecord] of pairs(this.results)) {
			const allPassed = Object.values(testCaseRecord)
				.every(({ errorMessage }) => errorMessage === undefined);
			const testCases = reverse(Object.entries(testCaseRecord))
				.sort(([nameA], [nameB]) => nameA < nameB);
			const totalTime = testCases
				.map(([_, { timeElapsed }]) => timeElapsed)
				.reduce((sum, n) => sum + n);

			let lastTestCaseName = testCases[0][0];
			results.appendLine(`[${getSymbol(allPassed)}] ${TestClass} (${math.round(totalTime * 1000)}ms)`);
			indent++;

			for (const testCase of testCases) {
				const [testCaseName, { errorMessage, timeElapsed, inputs }] = testCase;
				const totalElapsed = testCases
					.filter(([name]) => name === testCaseName)
					.map(([_, { timeElapsed }]) => timeElapsed)
					.reduce((sum, n) => sum + n);

				const isLast = testCases.indexOf(testCase) === testCases.size() - 1;
				const passed = errorMessage === undefined;
				appendIndent();

				if (testCaseName !== lastTestCaseName)
					results.appendLine(`${isLast ? "└" : "├"}── [${getSymbol(passed)}] ${testCaseName} (${math.round(totalElapsed * 1000)}ms)`);
				else {
					appendIndent();
					results.appendLine(`${isLast ? "└" : "├"}── [${getSymbol(passed)}] (${this.formatInputs(inputs)}) (${math.round(timeElapsed * 1000)}ms)`);
				}

				lastTestCaseName = testCaseName;
			}

			indent--;
		}

		results.appendLine("");
		for (const [_, testCases] of pairs(this.results))
			for (const [testCaseName, { errorMessage, inputs }] of pairs(testCases)) {
				if (errorMessage === undefined) continue;
				results.appendLine(testCaseName);
				results.appendLine(`Inputs: ${this.formatInputs(inputs)}`);
				results.appendLine(tostring(errorMessage));
				results.appendLine("");
			}

		const totalTests = this.passedTests + this.failedTests;
		results.appendLine(`Ran ${totalTests} tests in ${math.round(elapsedTime * 1000)}ms`);
		results.appendLine(`${colors ? GREEN : ""}Passed: ${this.passedTests}${colors ? RESET : ""}`);
		results.appendLine(`${colors ? RED : ""}Failed: ${this.failedTests}${colors ? RESET : ""}`);

		return results.toString();
	}

	private formatInputs(inputs: unknown[] | undefined) {
		return inputs !== undefined ?
			`(${(<defined[]>inputs).map(v => repr(v, { pretty: false })).join(", ")})`
			: "";
	}
}

export = TestRunner;