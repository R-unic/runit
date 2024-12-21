import { Reflect } from "@flamework/core";
import { Constructor } from "@flamework/core/out/utility";
import { StringBuilder } from "@rbxts/string-builder";
import { getDescendantsOfType } from "@rbxts/instance-utility";
import { flatten, reverse } from "@rbxts/array-utils";
import Object from "@rbxts/object-utils";
import repr from "@rbxts/repr";

import { type Maybe, Meta } from "./common";

interface TestCaseResult {
	readonly errorMessage?: string;
	readonly timeElapsed: number;
}

type TestClassInstance = Record<string, Callback>;

class TestRunner {
	private readonly testClasses: [Constructor<TestClassInstance>, TestClassInstance][];
	private failedTests = 0;
	private passedTests = 0;
	private results = new Map<Constructor, Record<string, TestCaseResult>>;

	public constructor(...roots: Instance[]) {
		this.testClasses = flatten(roots.map(root => getDescendantsOfType(root, "ModuleScript")))
			.map(module => {
				const TestClass = <Constructor<TestClassInstance>>require(module);
				(<any>TestClass).__moduleInstance = module;
				(<any>TestClass).__isNested = module.Parent !== undefined && !roots.includes(module.Parent);
				return [TestClass, new TestClass];
			});
	}

	public async run(reporter: (testResults: string) => void = print, colors = false): Promise<void> {
		this.results = new Map;

		const start = os.clock();
		for (const [TestClass, testClass] of this.testClasses) {
			const properties = Reflect.getProperties(TestClass);
			const factNames = properties.filter(property => Reflect.hasMetadata(TestClass, Meta.Fact, property))
			const theoryNames = properties.filter(property => Reflect.hasMetadata(TestClass, Meta.Theory, property));

			const fail = (exception: unknown, name: string, timeElapsed: number, extra?: string): void => {
				this.failedTests++;

				let classResults = this.results.get(TestClass);
				if (classResults === undefined)
					classResults = this.results.set(TestClass, {}).get(TestClass)!;

				classResults[`${name}${extra !== undefined ? " - " + extra : ""}`] = {
					errorMessage: tostring(exception),
					timeElapsed
				};
			}
			const pass = (name: string, timeElapsed: number, extra?: string): void => {
				this.passedTests++;
				let classResults = this.results.get(TestClass);
				if (classResults === undefined)
					classResults = this.results.set(TestClass, {}).get(TestClass)!;

				classResults[`${name}${extra !== undefined ? " | " + extra : ""}`] = { timeElapsed };
			}
			const runTestCase = async (testCase: Callback, name: string, args?: unknown[]): Promise<boolean> => {
				const inputDisplay = args !== undefined ? `input: (${(<defined[]>args).map(v => repr(v, { pretty: false })).join(", ")})` : undefined;
				const start = os.clock();
				try {
					await testCase(testClass, ...args ?? []);
				} catch (e) {
					const timeElapsed = os.clock() - start;
					fail(e, name, timeElapsed, inputDisplay);
					return false;
				}

				const timeElapsed = os.clock() - start;
				pass(name, timeElapsed, inputDisplay);
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
			: passed ? "+" : "x";

		for (const [TestClass, testCaseRecord] of pairs(this.results)) {
			const allPassed = Object.values(testCaseRecord)
				.every(({ errorMessage }) => errorMessage === undefined);
			const testCases = reverse(Object.entries(testCaseRecord))
				.sort(([nameA], [nameB]) => nameA < nameB);
			const totalTime = testCases
				.map(([_, { timeElapsed }]) => timeElapsed)
				.reduce((sum, n) => sum + n);

			results.appendLine(`[${getSymbol(allPassed)}] ${TestClass} (${math.round(totalTime * 1000)}ms)`);
			indent++;
			for (const [testCaseName, { errorMessage, timeElapsed }] of testCases) {
				const passed = errorMessage === undefined;
				appendIndent();
				results.appendLine(`[${getSymbol(passed)}] ${testCaseName} (${math.round(timeElapsed * 1000)}ms)`)
			}
			indent--;
		}

		results.appendLine("");
		for (const [_, testCases] of pairs(this.results))
			for (const [testCaseName, { errorMessage }] of pairs(testCases)) {
				if (errorMessage === undefined) continue;
				results.append(testCaseName + " - ");
				results.appendLine(tostring(errorMessage));
				results.appendLine("");
			}

		const totalTests = this.passedTests + this.failedTests;
		results.appendLine(`Ran ${totalTests} tests in ${math.round(elapsedTime * 1000)}ms`);
		results.appendLine(`Passed: ${this.passedTests}`);
		results.appendLine(`Failed: ${this.failedTests}`);

		return results.toString();
	}
}

export = TestRunner;