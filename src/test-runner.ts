import { Reflect } from "@flamework/core";
import { Constructor } from "@flamework/core/out/utility";
import { StringBuilder } from "@rbxts/string-builder";
import { getDescendantsOfType } from "@rbxts/instance-utility";
import { flatten, reverse } from "@rbxts/array-utils";
import Object from "@rbxts/object-utils";

import { Maybe, Meta } from "./common";

declare const newproxy: <T extends symbol = symbol>(addMetatable: boolean) => T;

/** Create a unique symbol */
function createSymbol<T extends symbol = symbol>(name: string): T {
	const symbol = newproxy<T>(true);
	const mt = <Record<string, unknown>>getmetatable(<never>symbol);
	mt.__tostring = () => name;
	return symbol;
}

type TestClassInstance = Record<string, Callback>;
type TestPassedSymbol = symbol & {
	readonly __skip?: undefined;
};

const TestPassed = createSymbol<TestPassedSymbol>("Runit.TestPassed");

class TestRunner {
	private readonly testClasses: [Constructor<TestClassInstance>, TestClassInstance][];
	private failedTests = 0;
	private passedTests = 0;
	private results = new Map<Constructor, Record<string, string | TestPassedSymbol>>;

	public constructor(...roots: Instance[]) {
		this.testClasses = flatten(roots.map(root => getDescendantsOfType(root, "ModuleScript")))
			.map(module => {
				const TestClass = <Constructor<TestClassInstance>>require(module);
				(<any>TestClass).__moduleInstance = module;
				(<any>TestClass).__isNested = module.Parent !== undefined && !roots.includes(module.Parent);
				return [TestClass, new TestClass];
			});
	}

	public async run(): Promise<void>
	public async run(reporter: (testResults: string) => void): Promise<void>
	public async run(reporter: (testResults: string) => void = print): Promise<void> {
		this.results = new Map;

		const start = os.clock();
		for (const [TestClass, testClass] of this.testClasses) {
			const properties = Reflect.getProperties(TestClass);
			const factNames = properties.filter(property => Reflect.hasMetadata(TestClass, Meta.Fact, property))
			const theoryNames = properties.filter(property => Reflect.hasMetadata(TestClass, Meta.Theory, property));

			const fail = (exception: unknown, name: string, extra?: string): void => {
				this.failedTests++;

				let classResults = this.results.get(TestClass);
				if (classResults === undefined)
					classResults = this.results.set(TestClass, {}).get(TestClass)!;

				classResults[`${name}${extra !== undefined ? " | " + extra : ""}`] = tostring(exception);
			}
			const pass = (name: string, extra?: string): void => {
				this.passedTests++;
				let classResults = this.results.get(TestClass);
				if (classResults === undefined)
					classResults = this.results.set(TestClass, {}).get(TestClass)!;

				classResults[`${name}${extra !== undefined ? " | " + extra : ""}`] = TestPassed;
			}
			const runTestCase = async (testCase: Callback, name: string, args?: unknown[]): Promise<boolean> => {
				const inputDisplay = args !== undefined ? `input: (${(<defined[]>args).map(tostring).join(", ")})` : undefined;
				try {
					await testCase(testClass, ...args ?? []);
				} catch (e) {
					fail(e, name, inputDisplay);
					return false;
				}

				pass(name, inputDisplay);
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
		reporter(this.generateOutput(elapsedTime));
	}

	private generateOutput(elapsedTime: number): string {
		const results = new StringBuilder;
		let indent = 0;

		const appendIndent = () => results.append("  ".rep(indent));

		for (const [TestClass, testCases] of pairs(this.results)) {
			const allPassed = Object.values(testCases).every(value => value === TestPassed);
			results.appendLine(`[${allPassed ? "+" : "x"}] ${TestClass}`);

			indent++;
			for (const [testCaseName, message] of reverse(Object.entries(testCases))) {
				const passed = message === TestPassed;
				appendIndent();
				results.appendLine(`[${passed ? "+" : "x"}] ${testCaseName}`)
			}
			indent--;
		}

		results.appendLine("");
		for (const [_, testCases] of pairs(this.results))
			for (const [testCaseName, message] of pairs(testCases)) {
				if (message === TestPassed) continue;
				results.append(testCaseName + "  -  ");
				results.appendLine(<string>message);
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