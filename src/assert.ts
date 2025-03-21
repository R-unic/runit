import { Modding } from "@flamework/core";
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
  public static throwsAsync(method: () => Promise<void>, exception: string): void
  public static async throwsAsync(method: () => Promise<void>, exception?: string | ClassType): Promise<void> {
    let exceptionThrown = false;
    let thrown: unknown = undefined;

    await method()
      .catch((e: unknown) => {
        thrown = e;
        exceptionThrown = exception !== undefined && typeOf(exception) === "string"
          ? e === exception || e instanceof (exception as ClassType)
          : true;
      });

    if (exceptionThrown) return;
    throw new AssertionFailedException(`Expected async method to throw${exception !== undefined ? `\nExpected: ${tostring(exception)}\nActual: ${thrown}` : ""}`);
  }

  public static doesNotThrow(method: () => void): void {
    try {
      method();
    } catch (e) {
      throw new AssertionFailedException(`Expected method not to throw, threw:\n${e}`);
    }
  }

  public static throws(method: () => void): void
  public static throws(method: () => void, exception: string): void
  public static throws(method: () => void, exception?: string | ClassType): void {
    let thrown: unknown = undefined;

    try {
      method();
    } catch (e) {
      thrown = e;
      if (exception !== undefined) {
        if (e === exception || e instanceof (exception as ClassType)) return;
      } else
        return;
    }

    throw new AssertionFailedException(`Expected method to throw${exception !== undefined ? ' "' + tostring(exception) + `", threw "${thrown}"` : ""}`);
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
    if (array.size() === 0) return;
    throw new AssertionFailedException("Expected array to be empty");
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

  public static true(value: unknown): void {
    this.equal(true, value);
  }

  public static false(value: unknown): void {
    this.equal(false, value);
  }

  public static undefined(value: unknown): void {
    if (value === undefined) return;
    this.equal(undefined, value);
  }

  public static notUndefined(value: unknown): void {
    if (value !== undefined) return;
    throw new AssertionFailedException("Expected value to not be undefined");
  }

  public static notEqual(expected: unknown, actual: unknown): void {
    if (expected !== actual) return;
    throw new AssertionFailedException("Expected values to be inequal");
  }

  public static equal(expected: unknown, actual: unknown): void {
    if (expected === actual) return;
    throw new AssertionFailedException(expected, actual);
  }
}

export = Assert;