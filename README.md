# Runit
### pronounced "R Unit"
A unit testing library for Roblox heavily inspired by xUnit from C#

## Example

src/scripts/run-tests.server.ts
```ts
import { TestRunner } from "@rbxts/runit";
import { ServerScriptService } from "@rbxts/services";

const testRunner = new TestRunner(
  ServerScriptService.WaitForChild("Tests")
);

testRunner.run();
```

src/tests/number-utility-test.ts
```ts
import { Fact, Theory, InlineData, Assert } from "@rbxts/runit";

function toNearestFiveOrTen(n: number): number {
  const nearestFive = round(n / 5) * 5;
  const lowerTen = floor(nearestFive / 10) * 10;
  const upperTen = lowerTen + 10;

  if (abs(n - lowerTen) <= abs(n - nearestFive))
    return lowerTen;
  else if (abs(n - upperTen) <= abs(n - nearestFive))
    return upperTen;

  return nearestFive;
}

class NumberUtilityTest {
  // tests one case
  @Fact
  public eightBecomesTen(): void {
    Assert.equal(10, toNearestFiveOrTen(8));
  }

  // tests multiple cases
  @Theory
  @InlineData(8, 10)
  @InlineData(14, 15)
  @InlineData(18, 20)
  @InlineData(3, 5)
  @InlineData(2, 0)
  public roundsToNearestFiveOrTen(input: number, expected: number): void {
    Assert.equal(expected, toNearestFiveOrTen(input));
  }
}

export = NumberUtilityTest;
```

## Setup/Teardown
Setup can be done via the constructor. Teardown is done using the `destroy` method, which is automatically called after all tests have completed.
```ts
class MyTest {
  private readonly junk = new Junk;

  public destroy(): void {
    this.junk.destroy();
  }
}
```