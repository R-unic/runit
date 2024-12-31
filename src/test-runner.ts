import { Reflect } from "@flamework/core";
import { Constructor } from "@flamework/core/out/utility";
import { StringBuilder } from "@rbxts/string-builder";
import { getDescendantsOfType } from "@rbxts/instance-utility";
import { flatten, reverse } from "@rbxts/array-utils";
import Object from "@rbxts/object-utils";

import { type Maybe, Meta } from "./common";
import repr from "@rbxts/repr";

type TestClassInstance = Record<string, Callback>;
type TestClassConstructor = Constructor<TestClassInstance>;

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
	private readonly testClasses: [TestClassConstructor, TestClassInstance][];
	private results = new Map<Constructor, Record<string, TestCaseResult[]>>;
	private failedTests = 0;
	private passedTests = 0;

	public constructor(...roots: Instance[]) {
		this.testClasses = flatten(roots.map(root => getDescendantsOfType(root, "ModuleScript")))
			.map<[TestClassConstructor, TestClassInstance]>(module => {
				const TestClass = <TestClassConstructor>require(module);
				(<any>TestClass).__moduleInstance = module;
				(<any>TestClass).__isNested = module.Parent !== undefined && !roots.includes(module.Parent);
				return [TestClass, new TestClass];
			})
			.sort(([classA], [classB]) => {
				const orderA = Reflect.getMetadata<number>(classA, Meta.LoadOrder) ?? math.huge;
				const orderB = Reflect.getMetadata<number>(classB, Meta.LoadOrder) ?? math.huge;
				return orderA < orderB;
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

			const addResult = (name: string, result: TestCaseResult) => {
				let classResults = this.results.get(TestClass);
				if (classResults === undefined)
					classResults = this.results.set(TestClass, {}).get(TestClass)!;

				const results = classResults[name] ?? [];
				results.push(result);
				classResults[name] = results;
			};
			const fail = (exception: unknown, name: string, { timeElapsed, inputs }: Omit<TestCaseResult, "errorMessage">): void => {
				this.failedTests++;
				addResult(name, {
					errorMessage: tostring(exception),
					timeElapsed,
					inputs
				});
			};
			const pass = (name: string, { timeElapsed, inputs }: Omit<TestCaseResult, "errorMessage">): void => {
				this.passedTests++;
				addResult(name, {
					timeElapsed,
					inputs
				});
			};
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
			(passed ? `${GREEN}+${RESET}` : `${RED}×${RESET}`)
			: (passed ? "+" : "×");

		for (const [TestClass, testResultRecord] of pairs(this.results)) {
			const testResults = Object.entries(testResultRecord);
			const allPassed = testResults
				.every(([_, cases]) => cases.every(({ errorMessage }) => errorMessage === undefined));
			const totalTime = testResults
				.map(([_, cases]) => cases.map(result => result.timeElapsed).reduce((sum, n) => sum + n))
				.reduce((sum, n) => sum + n);

			results.appendLine(`[${getSymbol(allPassed)}] ${TestClass} (${math.round(totalTime * 1000)}ms)`);
			indent++;

			for (const testResult of testResults) {
				const [testCaseName, cases] = testResult;
				const totalElapsed = testResults
					.filter(([name]) => name === testCaseName)
					.map(([_, cases]) => cases.map(result => result.timeElapsed).reduce((sum, n) => sum + n))
					.reduce((sum, n) => sum + n);

				const allPassed = cases.every(({ errorMessage }) => errorMessage === undefined);
				const isLast = testResults.indexOf(testResult) === testResults.size() - 1;
				const hasInputs = cases.size() > 0 && cases[0].inputs !== undefined;
				appendIndent();
				results.appendLine(`${isLast || hasInputs ? "└" : "├"}── [${getSymbol(allPassed)}] ${testCaseName} (${math.round(totalElapsed * 1000)}ms)`);

				if (hasInputs) {
					indent++;
					for (const testCase of cases) {
						const { errorMessage, timeElapsed, inputs } = testCase;
						const isLast = cases.indexOf(testCase) === cases.size() - 1;
						const passed = errorMessage === undefined;
						appendIndent();
						results.appendLine(`${isLast ? "└" : "├"}── [${getSymbol(passed)}] ${this.formatInputs(inputs)} (${math.round(timeElapsed * 1000)}ms)`);
					}
					indent--;
				}
			}

			indent--;
		}


		if (this.failedTests > 0) {
			results.appendLine("");
			results.appendLine("Failures:");
		}

		let failureIndex = 0;
		for (const [_, testResults] of pairs(this.results))
			for (const [testCaseName, cases] of pairs(testResults))
				for (const { errorMessage, inputs } of cases) {
					if (errorMessage === undefined) continue;
					results.appendLine(`${++failureIndex}. ${testCaseName}`);
					indent++;

					if (inputs !== undefined) {
						appendIndent();
						results.appendLine(`Inputs: ${this.formatInputs(inputs)}`);
					}

					const errorDisplay = (colors ? RED : "") + tostring(errorMessage).split("\n").map(line => "   ".rep(indent) + line).join("\n") + (colors ? RESET : "");
					results.appendLine(errorDisplay);
					results.appendLine("");
					indent--;
				}

		const totalTests = this.passedTests + this.failedTests;
		results.appendLine("");
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