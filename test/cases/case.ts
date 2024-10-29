/* eslint-disable */
// @ts-nocheck
import { foo } from "./relative-dep-ts";
import pick from "lodash/pick";
const babelParser = require('@babel/parser');

export function makeGreeting(s: string) {
    return `Hello, ${s}`; 
}
