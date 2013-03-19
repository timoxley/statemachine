'use strict'
var Emitter = require('emitter')
var delegate = require('delegate')
var debug = require('debug')
var log = debug('state')

var reactive = require('reactive')

debug.enable('state')

function State(name) {
  this.name = name
  var self = this
  this.on('leave', function(state) {
    if (state === this) return
    var args = [].slice.call(arguments)
    self._splitByName.apply(self, ['leave'].concat(args))
    state.emit.apply(state, ['leaving'].concat(args))
  })
  this.on('enter', function(state) {
    var args = [].slice.call(arguments)
    self._splitByName.apply(self, ['enter'].concat(args))
    state.emit.apply(state, ['entering'].concat(args))
  })
  this.on('leaving', function() {
    self.state && self.leave()
    self.state = undefined
  })
}
Emitter(State.prototype)

Workflow = State

Emitter(Workflow.prototype)
Workflow.prototype.trigger = function(action) {
  var args = [].slice.call(arguments, 1)
  if (this.state[action] && typeof this.state[action] === 'function') {
    log('triggering action "%s" in state "%s"', action, this.state.name)
    this.state[action].apply(this, args)
    this.emit.apply(this, ['trigger ' + action, this.state].concat(args))
    this.state.emit.apply(this.state, ['trigger ' + action].concat(args))
    return true
  } else {
    log('action "%s" not found in state "%s"', action, this.state.name)
    return false
  }
}

Workflow.prototype.goToState = function goToState(state) {
  var foundState = state
  if (typeof state === 'string') foundState = this.findState(state)
  if (!foundState) return log('Trying to go to no state?', state)
  var args = [].slice.call(arguments, 1)
  this.add(foundState)
  this.leave()
  this.state = foundState
  this.enter(this.state, args)
}

Workflow.prototype.findState = function findState(stateName) {
  var state = this.states.filter(function(state) {
    return state.name === stateName
  })
  if (!state.length) return undefined
  return state.pop()
}

Workflow.prototype.add = function(state) {
  this.states = this.states || []
  if (~this.states.indexOf(state)) return
  if (this.findState(state)) throw new Error('State names must be unique!')
  this.states.push(state)
  state.parent = this
  this.emit('add', state)
}

Workflow.prototype.leave = function() {
  if (!this.state) return
  this.emit('leave', this.state)
}

Workflow.prototype.enter = function(state, args) {
  this.emit.apply(this, ['enter', state].concat(args))
}

/**
 * Reemits enter/leave events as '[type] [state.name]' so you can
 * bind callbacks to specific state events.
 * e.g. this.on('leave login', fn)
 *
 * @param String type
 * @param State state
 * @api private
 */
Workflow.prototype._splitByName = function splitByName(type, state) {
  var args = [].slice.call(arguments, 2)
  if (!args.length) args = ''
  var message = [type + ' ' + state.name].concat(args)
  log.apply(null, message)
  this.emit.apply(this, message)
}


module.exports.State = State
module.exports.Workflow = Workflow
