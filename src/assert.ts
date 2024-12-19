import { Range } from "@rbxts/range";
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
    error(this.toString(), 4);
  }

  public static multipleFailures(totalItems: number, errors: [number, string, string][]): AssertionFailedException {
    const message = `Assert.all() failure: ${errors.size()} of ${totalItems} items in the collection did not pass\n` +
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
  public static throws(method: () => void): void
  public static throws(method: () => void, exception: string): void
  public static throws(method: () => void, exception?: string | ClassType): void {
    try {
      method();
    } catch (e) {
      if (exception !== undefined) {
        if (typeOf(exception) === "string") {
          if (e === exception) return;
        } else {
          if (exception instanceof <ClassType>exception) return;
        }
      } else
        return;
    }

    throw new AssertionFailedException(`Expected method to throw`);
  }

  public static all<T extends defined>(array: T[], predicate: (element: T) => void): void {
    const errors: [number, string, string][] = [];
    let index = 0;

    for (const element of array) {
      try {
        predicate(element);
      } catch (e) {
        errors.push([index, tostring(element), tostring(e)]);
      }
      index++;
    }

    if (errors.size() > 0)
      throw AssertionFailedException.multipleFailures(index, errors);
  }

  public static doesNotContain<T extends defined>(expectedElement: T, array: T[]): void {
    if (!array.includes(expectedElement)) return;
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

  public static inRange(number: number, range: Range): void
  public static inRange(number: number, minimum: number, maximum: number): void
  public static inRange(number: number, minimum: number | Range, maximum?: number): void {
    if (typeOf(minimum) === "number") {
      if (number >= <number>minimum && number <= maximum!) return;
      throw new AssertionFailedException(`${minimum}-${maximum}`, number);
    } else {
      const range = <Range>minimum;
      if (!range.isNumberWithin(number)) return;
      throw new AssertionFailedException(range.toString(), number);
    }
  }

  public static isType(value: unknown, expectedType: keyof CheckableTypes | ClassType): void {
    if (typeOf(expectedType) === "string") {
      const actualType = typeOf(value);
      if (actualType === expectedType) return;
      throw new AssertionFailedException(`Expected type: ${expectedType}\nActual type: ${actualType}`);
    } else {
      if (value instanceof <ClassType>expectedType) return;
      throw new AssertionFailedException(`Expected class type: ${expectedType}\nActual class type: ${typeOf(value) === "table" ? value : typeOf(value)}`);
    }
  }

  public static true(value: unknown): void {
    this.equal(true, value);
  }

  public static false(value: unknown): void {
    this.equal(false, value);
  }

  public static undefined(value: unknown): void {
    this.equal(undefined, value);
  }

  public static notUndefined(value: unknown): void {
    if (value !== undefined) return;
    throw new AssertionFailedException(`Expected value to not be undefined`);
  }

  public static equal(expected: unknown, actual: unknown): void {
    if (expected === actual) return;
    throw new AssertionFailedException(expected, actual);
  }
}

export = Assert;