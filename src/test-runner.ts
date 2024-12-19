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

type TestPassedSymbol = symbol & {
	readonly __skip?: undefined;
};

const TestPassed = createSymbol<TestPassedSymbol>("Runit.TestPassed");

class TestRunner {
	private readonly testClasses: [Constructor, object][];
	private failedTests = 0;
	private passedTests = 0;
	private results: Record<string, Record<string, string | TestPassedSymbol>> = {};

	public constructor(
		private readonly roots: Instance[],
		private readonly reporter: (testResults: string) => void = print
	) {
		this.testClasses = flatten(this.roots.map(root => getDescendantsOfType(root, "ModuleScript")))
			.map(module => {
				const TestClass = <Constructor>require(module);
				return [TestClass, new TestClass];
			});
	}

	public run(): void {
		const start = os.clock();
		for (const [TestClass, testClass] of this.testClasses) {
			const testClassName = tostring(TestClass);
			const properties = Reflect.getProperties(TestClass);
			const factNames = properties.filter(property => Reflect.hasMetadata(TestClass, Meta.Fact, property))
			const theoryNames = properties.filter(property => Reflect.hasMetadata(TestClass, Meta.Theory, property));

			const fail = (exception: unknown, name: string, extra?: string) => {
				this.failedTests++;
				if (this.results[testClassName] === undefined)
					this.results[testClassName] = {};

				// const split = tostring(exception).split(":");
				// split.shift();
				// split.shift();

				this.results[testClassName][`${name}${extra !== undefined ? " | " + extra : ""}`] = tostring(exception); //split.join(":");
			}
			const pass = (name: string, extra?: string) => {
				this.passedTests++;
				if (this.results[testClassName] === undefined)
					this.results[testClassName] = {};

				this.results[testClassName][`${name}${extra !== undefined ? " | " + extra : ""}`] = TestPassed;
			}

			for (const factName of factNames) {
				const fact = <Callback>testClass[<never>factName];
				try {
					fact();
				} catch (e) {
					fail(e, factName);
					continue;
				}
				pass(factName);
			}

			for (const theoryName of theoryNames) {
				const theory = <Callback>testClass[<never>theoryName];
				const testCases = <Maybe<unknown[][]>>Reflect.getMetadata(TestClass, Meta.InlineData, theoryName);
				if (testCases === undefined)
					throw `No data was provided to Theory test "${theoryName}"`;

				for (const args of reverse(testCases)) {
					const inputDisplay = `input: (${(<defined[]>args).map(tostring).join(", ")})`;
					try {
						theory(testClass, ...args);
					} catch (e) {
						fail(e, theoryName, inputDisplay);
						continue;
					}
					pass(theoryName, inputDisplay);
				}
			}
		}

		const elapsedTime = os.clock() - start;
		this.reporter(this.generateOutput(elapsedTime));
	}

	private generateOutput(elapsedTime: number): string {
		const results = new StringBuilder;
		let indent = 0;

		const appendIndent = () => results.append("  ".rep(indent));

		for (const [testClassName, testCases] of pairs(this.results)) {
			const allPassed = Object.values(testCases).every(value => value === TestPassed);
			results.appendLine(`[${allPassed ? "+" : "x"}] ${testClassName}`);

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