/* eslint-disable */
import React from 'react';
import { connect } from 'react-redux';
import 'redux';
import SomeComponent from './SomeComponent'
import { on } from 'defi';
import 'azaza-lol-bar'; // unexisting package

import foo from 'azaza-lol-baz'; // check-imports-ignore-line

const x = await import('tailwind-to-object');

window.jQuery = require('jquery');

import('foo!./someModule');
import('foo!bar!recompose?baz1=baz2&baz3=baz4');

export default () => <SomeComponent>Hello world</SomeComponent>
