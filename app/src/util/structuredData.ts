export type TStructuredData = null | boolean | number | string | TStructuredData[] | {
    [key: string]: TStructuredData;
};

const isIdentifierStart = (char: string) => {
    return /[A-Za-z_$]/.test(char);
};

const isIdentifierPart = (char: string) => {
    return /[A-Za-z0-9_$]/.test(char);
};

const getLineAndColumn = (text: string, index: number) => {
    const lines = text.slice(0, index).split(/\r?\n/);
    return {
        line: lines.length,
        column: lines[lines.length - 1].length + 1,
    };
};

class StructuredDataParser {
    private index = 0;

    constructor(private readonly text: string) {
    }

    public parse(): TStructuredData {
        this.skipWhitespaceAndComments();
        const value = this.parseValue();
        this.skipWhitespaceAndComments();
        if (!this.isEOF()) {
            this.fail(`Unexpected token "${this.peek()}"`);
        }
        return value;
    }

    private parseValue(): TStructuredData {
        const char = this.peek();
        if (char === "{") {
            return this.parseObject();
        }
        if (char === "[") {
            return this.parseArray();
        }
        if (char === "\"" || char === "'") {
            return this.parseString();
        }
        if (char === "-" || this.isDigit(char)) {
            return this.parseNumber();
        }
        if (char === "t") {
            return this.parseKeyword("true", true);
        }
        if (char === "f") {
            return this.parseKeyword("false", false);
        }
        if (char === "n") {
            return this.parseKeyword("null", null);
        }
        this.fail(char ? `Unsupported token "${char}"` : "Unexpected end of input");
    }

    private parseObject(): Record<string, TStructuredData> {
        const result: Record<string, TStructuredData> = {};
        this.consume("{");
        this.skipWhitespaceAndComments();
        if (this.peek() === "}") {
            this.consume("}");
            return result;
        }
        while (!this.isEOF()) {
            const key = this.parseKey();
            this.skipWhitespaceAndComments();
            this.consume(":");
            this.skipWhitespaceAndComments();
            result[key] = this.parseValue();
            this.skipWhitespaceAndComments();
            if (this.peek() === "}") {
                this.consume("}");
                return result;
            }
            this.consume(",");
            this.skipWhitespaceAndComments();
            if (this.peek() === "}") {
                this.consume("}");
                return result;
            }
        }
        this.fail("Unterminated object literal");
    }

    private parseArray(): TStructuredData[] {
        const result: TStructuredData[] = [];
        this.consume("[");
        this.skipWhitespaceAndComments();
        if (this.peek() === "]") {
            this.consume("]");
            return result;
        }
        while (!this.isEOF()) {
            result.push(this.parseValue());
            this.skipWhitespaceAndComments();
            if (this.peek() === "]") {
                this.consume("]");
                return result;
            }
            this.consume(",");
            this.skipWhitespaceAndComments();
            if (this.peek() === "]") {
                this.consume("]");
                return result;
            }
        }
        this.fail("Unterminated array literal");
    }

    private parseKey(): string {
        const char = this.peek();
        if (char === "\"" || char === "'") {
            return this.parseString();
        }
        return this.parseIdentifierKey();
    }

    private parseIdentifierKey(): string {
        const char = this.peek();
        if (!isIdentifierStart(char)) {
            this.fail(`Unexpected token "${char || "EOF"}" while parsing object key`);
        }
        const start = this.index;
        this.index++;
        while (!this.isEOF() && isIdentifierPart(this.peek())) {
            this.index++;
        }
        return this.text.slice(start, this.index);
    }

    private parseString(): string {
        const quote = this.consume();
        let value = "";
        while (!this.isEOF()) {
            const char = this.consume();
            if (char === quote) {
                return value;
            }
            if (char === "\\") {
                if (this.isEOF()) {
                    this.fail("Unterminated escape sequence");
                }
                const escaped = this.consume();
                if (escaped === "u") {
                    const unicode = this.readChars(4);
                    if (!/^[0-9a-fA-F]{4}$/.test(unicode)) {
                        this.fail(`Invalid unicode escape "\\u${unicode}"`);
                    }
                    value += String.fromCharCode(parseInt(unicode, 16));
                    continue;
                }
                const escapeMap: Record<string, string> = {
                    "\"": "\"",
                    "'": "'",
                    "\\": "\\",
                    "/": "/",
                    b: "\b",
                    f: "\f",
                    n: "\n",
                    r: "\r",
                    t: "\t",
                };
                if (!(escaped in escapeMap)) {
                    this.fail(`Invalid escape sequence "\\${escaped}"`);
                }
                value += escapeMap[escaped];
                continue;
            }
            if (char === "\n" || char === "\r") {
                this.fail("Unterminated string literal");
            }
            value += char;
        }
        this.fail("Unterminated string literal");
    }

    private parseNumber(): number {
        const remaining = this.text.slice(this.index);
        const match = remaining.match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
        if (!match) {
            this.fail("Invalid number literal");
        }
        this.index += match[0].length;
        return Number(match[0]);
    }

    private parseKeyword(keyword: string, value: true | false | null) {
        if (this.text.slice(this.index, this.index + keyword.length) !== keyword) {
            this.fail(`Unexpected token "${this.peek()}"`);
        }
        const next = this.text[this.index + keyword.length] || "";
        if (next && isIdentifierPart(next)) {
            this.fail(`Unexpected token "${this.text.slice(this.index, this.index + keyword.length + 1)}"`);
        }
        this.index += keyword.length;
        return value;
    }

    private skipWhitespaceAndComments() {
        while (!this.isEOF()) {
            const char = this.peek();
            if (/\s/.test(char)) {
                this.index++;
                continue;
            }
            if (char === "/" && this.peek(1) === "/") {
                this.index += 2;
                while (!this.isEOF() && !/[\r\n]/.test(this.peek())) {
                    this.index++;
                }
                continue;
            }
            if (char === "/" && this.peek(1) === "*") {
                this.index += 2;
                while (!this.isEOF() && !(this.peek() === "*" && this.peek(1) === "/")) {
                    this.index++;
                }
                if (this.isEOF()) {
                    this.fail("Unterminated block comment");
                }
                this.index += 2;
                continue;
            }
            break;
        }
    }

    private consume(expected?: string) {
        const char = this.text[this.index];
        if (typeof expected === "string" && char !== expected) {
            this.fail(`Expected "${expected}" but found "${char || "EOF"}"`);
        }
        if (typeof char === "undefined") {
            this.fail("Unexpected end of input");
        }
        this.index++;
        return char;
    }

    private readChars(length: number) {
        const value = this.text.slice(this.index, this.index + length);
        if (value.length !== length) {
            this.fail("Unexpected end of input");
        }
        this.index += length;
        return value;
    }

    private peek(offset = 0) {
        return this.text[this.index + offset] || "";
    }

    private isDigit(char: string) {
        return /^[0-9]$/.test(char);
    }

    private isEOF() {
        return this.index >= this.text.length;
    }

    private fail(message: string): never {
        const position = getLineAndColumn(this.text, this.index);
        throw new Error(`${message} at ${position.line}:${position.column}`);
    }
}

export const parseStructuredData = (text: string) => {
    return new StructuredDataParser(text).parse();
};

export const isStructuredDataObject = (value: unknown): value is Record<string, TStructuredData> => {
    return typeof value === "object" && value !== null && !Array.isArray(value);
};

export const parseStructuredDataObject = (text: string, label = "Structured data") => {
    const value = parseStructuredData(text);
    if (!isStructuredDataObject(value)) {
        throw new Error(`${label} must be an object`);
    }
    return value;
};
