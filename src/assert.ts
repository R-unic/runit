import { Modding } from "@flamework/core";
import { Constructor } from "@flamework/core/out/utility";
import { Range, type RangeJSON } from "@rbxts/range";
import { endsWith, startsWith } from "@rbxts/string-utils";

type ClassType<T = object, Args extends unknown[] = never[]> = {
  new(...args: Args): T;
}

class AssertionFailedException {
  public readonly message: string;

  public constructor(expected: unknown, actual: unknown);
  public constructor(message: string);
  public constructor(
    message: unknown,
    actual?: unknown
  ) {
    this.message = actual !== undefined ? `Expected: ${message}\nActual: ${actual}` : <string>message;
    error(this.toString(), 5);
  }

  public static multipleFailures(methodName: string, totalItems: number, errors: [number, string, string][]): AssertionFailedException {
    const message = `Assert.${methodName}() failure: ${errors.size()} of ${totalItems} items in the collection did not pass\n` +
      errors
        .map(([index, element, err]) =>
          `${index}     ${element}\n` +
          `${" ".rep(tostring(index).size())}     ${err.split("\n").map(line => " ".rep(tostring(index).size()) + line).join("\n")}`
        )
        .join("\n");

    return new AssertionFailedException(message);
  }

  public toString(): string {
    return `Test failed!\n${this.message}`;
  }
}

class Assert {
  public static propertyEqual(object: object, property: string, expectedValue: unknown): void {
    const value = (object as Record<string, unknown>)[property];
    if (value === expectedValue) return;
    throw new AssertionFailedException(`Expected object property "${property}" to be ${expectedValue}, got ${value}`);
  }

  public static hasProperty(object: object, property: string): void {
    if (property in object) return;
    throw new AssertionFailedException(`Expected object to have property "${property}"`);
  }

  public static async doesNotThrowAsync(method: () => Promise<void>): Promise<void> {
    await method()
      .catch(e => {
        throw new AssertionFailedException(`Expected async method not to throw, threw:\n${e}`);
      });
  }

  public static throwsAsync(method: () => Promise<void>): void
  public static throwsAsync(method: () => Promise<void>, expectedException: string): void
  public static async throwsAsync(method: () => Promise<void>, expectedException?: string | ClassType): Promise<void> {
    let exceptionThrown = false;
    let thrown: unknown = undefined;

    await method()
      .catch((e: unknown) => {
        thrown = e;
        exceptionThrown = expectedException !== undefined && typeOf(expectedException) === "string"
          ? typeOf(expectedException) === "string"
            ? startsWith(tostring(e), expectedException as string) || endsWith(tostring(e), expectedException as string)
            : e instanceof (expectedException as ClassType)
          : true;
      });

    if (exceptionThrown) return;
    throw new AssertionFailedException(`Expected async method to throw${expectedException !== undefined ? `\nExpected: ${tostring(expectedException)}\nActual: ${thrown}` : ""}`);
  }

  public static doesNotThrow(method: () => void): void {
    try {
      method();
    } catch (e) {
      throw new AssertionFailedException(`Expected method not to throw, threw:\n${e}`);
    }
  }

  public static throws(method: () => void): void
  public static throws(method: () => void, expectedException: string | ClassType): void
  public static throws(method: () => void, expectedException?: string | ClassType): void {
    let thrown: unknown;

    try {
      method();
    } catch (e) {
      thrown = e;
      if (expectedException !== undefined) {
        if (typeOf(expectedException) === "string" ? startsWith(tostring(e), expectedException as string) || endsWith(tostring(e), expectedException as string) : e instanceof (expectedException as ClassType)) return;
      } else
        return;
    }

    throw new AssertionFailedException(`Expected method to throw${expectedException !== undefined ? ' "' + tostring(expectedException) + `", threw "${thrown}"` : ""}`);
  }

  public static all<T extends defined>(array: T[], predicate: (element: T, index: number) => void): void {
    const errors: [number, string, string][] = [];
    let index = 0;

    for (const element of array) {
      try {
        predicate(element, index);
      } catch (e) {
        errors.push([index, tostring(element), tostring(e)]);
      }
      index++;
    }

    if (errors.size() > 0)
      throw AssertionFailedException.multipleFailures("all", index, errors);
  }

  public static any<T extends defined>(array: T[], predicate: (element: T, index: number) => void): void {
    const errors: [number, string, string][] = [];
    let index = 0;

    for (const element of array) {
      try {
        predicate(element, index);
      } catch (e) {
        errors.push([index, tostring(element), tostring(e)]);
      }
      index++;
    }

    if (errors.size() === array.size())
      throw AssertionFailedException.multipleFailures("any", index, errors);
  }

  public static doesNotContain<T extends defined>(element: T, array: T[]): void {
    if (!array.includes(element)) return;
    throw new AssertionFailedException(`Expected array to not contain element "${array}"`);
  }

  public static contains<T extends defined>(expectedElement: T, array: T[]): void
  public static contains<T extends defined>(array: T[], predicate: (element: T) => boolean): void
  public static contains<T extends defined>(array: T[] | T, predicate: T[] | ((element: T) => boolean)): void {
    if (typeOf(predicate) === "function") {
      if ((<T[]>array).some(<(element: T) => boolean>predicate)) return;
      throw new AssertionFailedException("Expected array to contain elements matching the predicate");
    } else {
      if ((<T[]>predicate).includes(<T>array)) return;
      throw new AssertionFailedException(`Expected array to contain element "${array}"`);
    }
  }

  public static empty(array: defined[]): void {
    const size = array.size();
    if (size === 0) return;
    throw new AssertionFailedException(`Expected array to be empty\nActual length: ${size}`);
  }

  public static notEmpty(array: defined[]): void {
    if (array.size() > 0) return;
    throw new AssertionFailedException("Expected array not to be empty");
  }

  public static single(array: defined[]): void {
    const size = array.size();
    if (size === 1) return;
    throw new AssertionFailedException(`Expected array to have one element\nActual length: ${size}`);
  }

  public static count(expectedLength: number, collection: Map<unknown, unknown>): void;
  public static count(expectedLength: number, collection: Set<unknown>): void;
  public static count(expectedLength: number, collection: unknown[]): void;
  public static count(expectedLength: number, collection: unknown[] | Set<unknown> | Map<unknown, unknown>): void {
    const actualLength = (collection as Set<unknown>).size();
    if (expectedLength === actualLength) return;
    throw new AssertionFailedException(`Expected collection ${collection} to be of length ${expectedLength}\nActual length: ${actualLength}`);
  }

  public static startsWith(str: string, substring: string): void {
    if (startsWith(str, substring)) return
    throw new AssertionFailedException(`Expected string "${str}" to start with substring "${substring}"`);
  }

  public static endsWith(str: string, substring: string): void {
    if (endsWith(str, substring)) return
    throw new AssertionFailedException(`Expected string "${str}" to end with substring "${substring}"`);
  }

  public static inRange(number: number, range: RangeJSON): void
  public static inRange(number: number, range: Range): void
  public static inRange(number: number, minimum: number, maximum: number): void
  public static inRange(number: number, minimum: number | Range | RangeJSON, maximum?: number): void {
    const isNumber = (value: unknown): value is number => typeOf(minimum) === "number";
    if (isNumber(minimum)) {
      if (number >= (minimum as number) && number <= maximum!) return;
      throw new AssertionFailedException(`${minimum}-${maximum}`, number);
    } else {
      const range = minimum instanceof Range ? minimum : Range.fromJSON(minimum);
      if (!range.isNumberWithin(number)) return;
      throw new AssertionFailedException(range.toString(), number);
    }
  }

  /** @metadata macro */
  public static isType<Expected>(value: unknown, guard?: ((value: unknown) => value is Expected) | Modding.Generic<Expected, "guard">): value is Expected {
    const matches = guard?.(value) ?? false;
    if (matches) return true;

    // TODO: improve message using either @rbxts/reflect or rbxts-transform-debug
    throw new AssertionFailedException(`Type did not pass the provided type guard ${guard}`);
  }

  public static isCheckableType(value: unknown, expectedType: keyof CheckableTypes | ClassType): void {
    if (typeOf(expectedType) === "string") {
      const actualType = typeOf(value);
      if (actualType === expectedType) return;
      throw new AssertionFailedException(`Expected type: ${expectedType}\nActual type: ${actualType}`);
    }

    if (value instanceof <ClassType>expectedType) return;
    throw new AssertionFailedException(`Expected class type: ${expectedType}\nActual class type: ${typeOf(value) === "table" ? value : typeOf(value)}`);
  }

  public static true(value: unknown): asserts value is true {
    this.equal(true, value);
  }

  public static false(value: unknown): asserts value is false {
    this.equal(false, value);
  }

  public static undefined(value: unknown): asserts value is undefined {
    if (value === undefined) return;
    this.equal(undefined, value);
  }

  public static defined(value: unknown): asserts value is defined {
    if (value !== undefined) return;
    throw new AssertionFailedException("Expected value to not be undefined");
  }

  public static fuzzyEqual(expected: number, actual: number, epsilon = 1e-6): void {
    const difference = math.abs(expected - actual);
    const offBy = difference - epsilon;
    const near = offBy <= 0;
    if (near) return;

    throw new AssertionFailedException(`Expected values to be nearly equal\nExpected: ${expected}\nActual: ${actual}\nOff By: ${offBy}`);
  }

  public static notEqual(expected: unknown, actual: unknown): void {
    if (expected !== actual) return;
    throw new AssertionFailedException("Expected values to be inequal");
  }

  public static equal(expected: unknown, actual: unknown): void {
    if (expected === actual) return;
    throw new AssertionFailedException(expected, actual);
  }

  public static custom(runner: (fail: ((message: string) => void) | ((expected: unknown, actual: unknown) => void)) => void): void {
    runner((message, actual) => {
      throw new AssertionFailedException(message, actual)
    });
  }

  public static appendFailedMessage(message: string, runner: () => void): void {
    try {
      runner();
    } catch (e) {
      if (e instanceof AssertionFailedException)
        (e as Writable<AssertionFailedException>).message = `${message}\n${e.message}`;

      throw e;
    }
  }
}

export = Assert;