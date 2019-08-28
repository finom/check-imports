/* @flow */
import moment from "moment";

function foo(x: ?number): string {
  if (x) {
    return x;
  }
  return "default string";
}
