import assert from 'node:assert/strict';
import {presentationParametersValid} from '../web/d3d9-presentation.js';

const parameters = [800, 600, 23, 1, 0, 0, 2, 1, 0, 1, 0, 0, 0, 1];
assert.equal(presentationParametersValid(parameters, {windowSize: [800, 600]}), true);
assert.equal(presentationParametersValid(parameters, {windowSize: [640, 480]}), false);
assert.equal(presentationParametersValid([640, 480, ...parameters.slice(2)], {resize: true}), true);
assert.equal(presentationParametersValid([1280, 720, ...parameters.slice(2)], {resize: true}), true);
assert.equal(presentationParametersValid([0, 720, ...parameters.slice(2)], {resize: true}), false);
assert.equal(presentationParametersValid([4097, 720, ...parameters.slice(2)], {resize: true}), false);
assert.equal(presentationParametersValid([640, 480, 999, ...parameters.slice(3)], {resize: true}), false);
console.log('Direct3D presentation parameter creation and resolution reset validation passed');
