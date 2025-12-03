import { VariableFormatter, CustomFormatter } from "./variable-formatter";

describe("VariableFormatter", () => {
  let formatter: VariableFormatter;

  beforeEach(() => {
    formatter = new VariableFormatter();
  });

  describe("Primitive types", () => {
    it("should format null", () => {
      const result = formatter.format(null);
      expect(result.value).toBe("null");
      expect(result.type).toBe("null");
      expect(result.truncated).toBe(false);
    });

    it("should format undefined", () => {
      const result = formatter.format(undefined);
      expect(result.value).toBe("undefined");
      expect(result.type).toBe("undefined");
    });

    it("should format numbers", () => {
      expect(formatter.format(42).value).toBe("42");
      expect(formatter.format(3.14).value).toBe("3.14");
      expect(formatter.format(-10).value).toBe("-10");
    });

    it("should format booleans", () => {
      expect(formatter.format(true).value).toBe("true");
      expect(formatter.format(false).value).toBe("false");
    });

    it("should format strings", () => {
      const result = formatter.format("hello");
      expect(result.value).toBe('"hello"');
      expect(result.type).toBe("string");
    });

    it("should format bigint", () => {
      const result = formatter.format(BigInt(123));
      expect(result.value).toBe("123n");
      expect(result.type).toBe("bigint");
    });

    it("should format symbols", () => {
      const sym = Symbol("test");
      const result = formatter.format(sym);
      expect(result.value).toContain("Symbol(test)");
      expect(result.type).toBe("symbol");
    });
  });

  describe("String truncation", () => {
    it("should truncate long strings", () => {
      const longString = "a".repeat(300);
      const result = formatter.format(longString);

      expect(result.truncated).toBe(true);
      expect(result.value).toContain("truncated");
      expect(result.value.length).toBeLessThan(longString.length);
    });

    it("should not truncate short strings", () => {
      const result = formatter.format("short");
      expect(result.truncated).toBe(false);
    });
  });

  describe("Arrays", () => {
    it("should format empty arrays", () => {
      const result = formatter.format([]);
      expect(result.value).toBe("[]");
      expect(result.type).toBe("Array");
    });

    it("should format simple arrays", () => {
      const result = formatter.format([1, 2, 3]);
      expect(result.value).toContain("1");
      expect(result.value).toContain("2");
      expect(result.value).toContain("3");
    });

    it("should truncate large arrays", () => {
      const largeArray = Array.from({ length: 150 }, (_, i) => i);
      const result = formatter.format(largeArray);

      expect(result.truncated).toBe(true);
      expect(result.value).toContain("more");
    });

    it("should format nested arrays", () => {
      const nested = [
        [1, 2],
        [3, 4],
      ];
      const result = formatter.format(nested);

      expect(result.value).toContain("[");
      expect(result.value).toContain("1");
    });
  });

  describe("Objects", () => {
    it("should format empty objects", () => {
      const result = formatter.format({});
      expect(result.value).toBe("{}");
      expect(result.type).toBe("Object");
    });

    it("should format simple objects", () => {
      const obj = { name: "John", age: 30 };
      const result = formatter.format(obj);

      expect(result.value).toContain("name");
      expect(result.value).toContain("John");
      expect(result.value).toContain("age");
      expect(result.value).toContain("30");
    });

    it("should show types when enabled", () => {
      const obj = { value: 42 };
      const result = formatter.format(obj);

      expect(result.value).toContain("(number)");
    });

    it("should hide types when disabled", () => {
      const customFormatter = new VariableFormatter({ showTypes: false });
      const obj = { value: 42 };
      const result = customFormatter.format(obj);

      expect(result.value).not.toContain("(number)");
    });

    it("should respect max depth", () => {
      const deep = { a: { b: { c: { d: { e: "too deep" } } } } };
      const result = formatter.format(deep);

      expect(result.value).toContain("Max depth reached");
    });
  });

  describe("Functions", () => {
    it("should format named functions", () => {
      function myFunction() {
        return 42;
      }
      const result = formatter.format(myFunction);

      expect(result.value).toContain("Function");
      expect(result.value).toContain("myFunction");
      expect(result.type).toBe("function");
    });

    it("should format anonymous functions", () => {
      const result = formatter.format(() => {});
      expect(result.value).toContain("Function");
    });
  });

  describe("Special objects", () => {
    it("should format Dates", () => {
      const date = new Date("2024-01-01T00:00:00Z");
      const result = formatter.format(date);

      expect(result.value).toContain("2024-01-01");
      expect(result.type).toBe("Date");
    });

    it("should format Errors", () => {
      const error = new Error("Test error");
      const result = formatter.format(error);

      expect(result.value).toContain("Error");
      expect(result.value).toContain("Test error");
      expect(result.type).toBe("Error");
    });

    it("should format RegExp", () => {
      const regex = /test/gi;
      const result = formatter.format(regex);

      expect(result.value).toBe("/test/gi");
      expect(result.type).toBe("RegExp");
    });

    it("should format Maps", () => {
      const map = new Map([
        ["key1", "value1"],
        ["key2", "value2"],
      ]);
      const result = formatter.format(map);

      expect(result.value).toContain("Map(2)");
      expect(result.value).toContain("key1");
      expect(result.value).toContain("value1");
      expect(result.type).toBe("Map");
    });

    it("should format Sets", () => {
      const set = new Set([1, 2, 3]);
      const result = formatter.format(set);

      expect(result.value).toContain("Set(3)");
      expect(result.value).toContain("1");
      expect(result.value).toContain("2");
      expect(result.type).toBe("Set");
    });
  });

  describe("Custom formatters", () => {
    it("should use custom formatter when registered", () => {
      const customFormatter: CustomFormatter = {
        test: (value) => value?.constructor?.name === "CustomClass",
        format: (value) => `<CustomClass: ${value.name}>`,
      };

      class CustomClass {
        constructor(public name: string) {}
      }

      formatter.registerFormatter("custom", customFormatter);
      const obj = new CustomClass("test");
      const result = formatter.format(obj);

      expect(result.value).toBe("<CustomClass: test>");
    });

    it("should unregister custom formatter", () => {
      const customFormatter: CustomFormatter = {
        test: () => true,
        format: () => "custom",
      };

      formatter.registerFormatter("custom", customFormatter);
      const removed = formatter.unregisterFormatter("custom");

      expect(removed).toBe(true);
    });

    it("should return false when unregistering non-existent formatter", () => {
      const removed = formatter.unregisterFormatter("non-existent");
      expect(removed).toBe(false);
    });
  });

  describe("Options", () => {
    it("should respect maxDepth option", () => {
      const customFormatter = new VariableFormatter({ maxDepth: 1 });
      const deep = { a: { b: "value" } };
      const result = customFormatter.format(deep);

      expect(result.value).toContain("Max depth reached");
    });

    it("should respect maxArrayLength option", () => {
      const customFormatter = new VariableFormatter({ maxArrayLength: 2 });
      const arr = [1, 2, 3, 4, 5];
      const result = customFormatter.format(arr);

      expect(result.truncated).toBe(true);
      expect(result.value).toContain("more");
    });

    it("should respect maxStringLength option", () => {
      const customFormatter = new VariableFormatter({ maxStringLength: 5 });
      const str = "hello world";
      const result = customFormatter.format(str);

      expect(result.truncated).toBe(true);
    });

    it("should update options", () => {
      formatter.updateOptions({ maxDepth: 5 });
      const options = formatter.getOptions();

      expect(options.maxDepth).toBe(5);
    });

    it("should get current options", () => {
      const options = formatter.getOptions();

      expect(options.maxDepth).toBeDefined();
      expect(options.maxLength).toBeDefined();
    });
  });

  describe("Pretty printing", () => {
    it("should pretty print large objects", () => {
      const obj = {
        prop1: "value1",
        prop2: "value2",
        prop3: "value3",
        prop4: "value4",
      };
      const result = formatter.format(obj);

      // Should contain newlines for pretty printing
      expect(result.value).toContain("\n");
    });

    it("should inline small objects", () => {
      const obj = { a: 1 };
      const result = formatter.format(obj);

      // Should not contain newlines
      expect(result.value).not.toContain("\n");
    });
  });

  describe("Edge cases", () => {
    it("should handle circular references gracefully", () => {
      const obj: any = { name: "test" };
      obj.self = obj;

      // Should not throw, but may hit max depth
      expect(() => formatter.format(obj)).not.toThrow();
    });

    it("should handle properties that throw on access", () => {
      const obj = {};
      Object.defineProperty(obj, "badProp", {
        get() {
          throw new Error("Access denied");
        },
        enumerable: true,
      });

      const result = formatter.format(obj);
      expect(result.value).toContain("Error accessing property");
    });

    it("should handle empty Map", () => {
      const map = new Map();
      const result = formatter.format(map);

      expect(result.value).toBe("Map(0) {}");
    });

    it("should handle empty Set", () => {
      const set = new Set();
      const result = formatter.format(set);

      expect(result.value).toBe("Set(0) {}");
    });

    it("should use multiline formatting for large objects", () => {
      const obj = {
        property1: "value1",
        property2: "value2",
        property3: "value3",
        property4: "value4",
        property5: "value5",
      };
      const result = formatter.format(obj);

      // Should use multiline format (more than 3 properties)
      expect(result.value).toContain("\n");
    });

    it("should use single-line formatting for small objects", () => {
      const obj = { a: 1, b: 2 };
      const result = formatter.format(obj);

      // Should use single-line format
      expect(result.value).not.toContain("\n");
      expect(result.value).toContain("{ ");
      expect(result.value).toContain(" }");
    });

    it("should handle Map with many entries", () => {
      const map = new Map();
      for (let i = 0; i < 10; i++) {
        map.set(`key${i}`, `value${i}`);
      }
      const result = formatter.format(map);

      expect(result.value).toContain("Map(10)");
      expect(result.type).toBe("Map");
    });
  });
});
