"use strict"

var StateMachine = require('statemachine')
var State = require('statemachine').State
var Workflow = State
var assert = require('timoxley-assert')
var delegate = require('component-delegate')

var info = it

var app
var LoginState, ForgotPasswordState, HomeState

describe("Workflows", function() {
  info('Applications are workflows that guide users through various parts of the application.', function() {
    app = new Workflow()
  })

  info("A workflow will be composed of a set of distinct states. You might think of 'pages' as states.", function() {
    ForgotPasswordState = new State('forgot-password')
    LoginState = new State('login')
    HomeState = new State('home')
  })

  info("A state may have some visual representation.", function() {
    // Whenever a state is added, find an element for it
    app.on('add', function(state) {
      state.el = document.querySelector('.' + state.name)
    })
    app.add(LoginState)
    app.add(ForgotPasswordState)
    assert(LoginState.el instanceof Element)
    assert(ForgotPasswordState.el instanceof Element)
  });

  info("We construct our views when we enter the state.", function() {
    app.on('enter', function(newState) {
      // Add state.name class to body
      document.body.classList.add(newState.name);

      // Add 'enabled' class when we enter the state
      newState.el.classList.add('enabled')
    })

    app.goToState(LoginState)
    assert(LoginState.el.classList.contains('enabled'))
    assert(document.body.classList.contains(LoginState.name))
  })



  info("We should always reverse our changes when we leave a state.", function() {
    app.on('leave', function(oldState) {
      // undo everything done in the .on('enter')
      document.body.classList.remove(oldState.name);
      oldState.el.classList.remove('enabled')
    })

    app.goToState(ForgotPasswordState)
    assert(false == LoginState.el.classList.contains('enabled'))
    assert(false == document.body.classList.contains(LoginState.name))
  })

  info("This do/undo structure allows your app to switch between states safely.", function() {
    app.goToState(ForgotPasswordState)
    app.goToState(LoginState)
    app.goToState(ForgotPasswordState)
    app.goToState(LoginState)
    assert(false == ForgotPasswordState.el.classList.contains('enabled'))
    assert(false == document.body.classList.contains(ForgotPasswordState.name))
    assert(true == LoginState.el.classList.contains('enabled'))
    assert(true == document.body.classList.contains(LoginState.name))
  })
})

describe('Actions', function() {
  info("From within a state, there is some set of actions which can be performed.", function() {
    // For Example
    LoginState.forgotPassword = function() {}
    LoginState.authenticate = function(username, password) {}
  })


  info("Actions may perform calculations, then decide which state to go to next.", function() {
    LoginState.forgotPassword = function() {
      this.goToState(ForgotPassword)
    }

    LoginState.authenticate = function(username, password) {
      if (username == 'admin' && password == 'password') {
        this.goToState(HomeState)
      } else {
        // This isn't quite the right approach, we'll fix this later
        this.state.el.querySelector('.message').textContent = 'Invalid username or password'
      }
    }
  })

  info("Actions are triggered from the workflow.", function() {
    var didExecute = app.trigger('authenticate', 'admin', 'password')
    assert.strictEqual(app.state, HomeState)
    assert(didExecute)
  })

  info("Actions can only be triggered if they are valid in the current state", function() {
    assert.notStrictEqual(app.state, LoginState)
    assert.strictEqual(app.state.authenticate, undefined)
    var didExecute = app.trigger('authenticate', 'admin', 'password')
    assert(false == didExecute)
  })

  info("This is very useful if actions trigger async operations", function() {
    // Change authenticate action to be an asyncronous operation
    LoginState.authenticate = function(username, password) {
      AJAX('/login', {username: username, password: password}, function(success) {
        if (success) {
          app.trigger("loginSuccess")
        } else {
          app.trigger("loginError")
        }
      })
    }

    LoginState.loginSuccess = function() {
      this.goToState(HomeState)
    }

    LoginState.loginError = function() {
      LoginState.error = 'Invalid username or password'
    }
  })

  describe("async actions", function() {
    var originalLoginSuccess, originalLoginError, originalAuthenticate
    beforeEach(function() {
      originalLoginSuccess = LoginState.loginSuccess
      originalLoginError = LoginState.loginError
      originalAuthenticate = LoginState.authenticate

    })
    afterEach(function() {
      // restore original functions
      LoginState.loginSuccess = originalLoginSuccess
      LoginState.loginError = originalLoginError
      LoginState.authenticate = originalAuthenticate
    })
    info("If the state changes before the async action returns, actions won't be triggered", function(done) {
      var calledDestructiveActions = false
      LoginState.authenticate = function() {
        originalAuthenticate()
        assert(false == calledDestructiveActions)
        done()
      }

      // success and error functions should not be fired
      LoginState.loginSuccess = LoginState.loginError = function() {
        calledDestructiveActions = true
      }
      app.goToState(LoginState)
      // start async authentication process
      app.trigger('authenticate', 'admin', 'bad password')
      // change state before authentication process completes
      app.goToState(ForgotPasswordState)
    })
  })
  describe('user interaction', function() {
    info("Actions will generally be triggered by User interacting with the UI", function(done) {
      this.timeout(30000)
      var $ = document.querySelector.bind(document)
      app.on('enter login', function() {
        delegate.bind(this.state.el, 'form', 'submit', this.state.onSubmit)
        delegate.bind(this.state.el, '[name="forgot-password"]', 'click', this.state.onForgotPassword)
      })

      app.on('leave login', function() {
        delegate.unbind(this.state.el, 'form', 'submit',  this.state.onSubmit)
        delegate.unbind(this.state.el, '[name="forgot-password"]', 'click', this.state.onForgotPassword)
      })

      LoginState.onSubmit = function(e) {
        e.preventDefault()
        var username = e.target.querySelector('[name="username"]').value
        var password = e.target.querySelector('[name="password"]').value
        app.trigger('authenticate', username, password)
      }

      LoginState.onForgotPassword = function(e) {
        e.preventDefault()
        app.goToState(ForgotPasswordState)
      }


      app.on('enter forgot-password', function() {
        delegate.bind(this.state.el, '[name="back"]', 'click', ForgotPasswordState.onBack)
      })

      app.on('leave forgot-password', function() {
        delegate.unbind(ForgotPasswordState.el, '[name="back"]', 'click', ForgotPasswordState.onBack)
      })

      ForgotPasswordState.onBack = function(e) {
        e.preventDefault()
        app.goToState(ForgotPasswordState)
      }

      app.goToState(LoginState)
      console.log('Please Login.')

      app.once('enter home', function() {
        done()
      })
    })
  })
})

describe("Sub-States", function() {
  info("A state may be composed of other states internally", function(done) {
    this.timeout(30000)
    var DefaultLoginState = new State('default')
    var InvalidLoginState = new State('invalid')
    var LoadingLoginState = new State('loading')
    LoginState.add(DefaultLoginState)
    LoginState.add(InvalidLoginState)
    LoginState.add(LoadingLoginState)

    LoginState.on('enter invalid', function(message) {
      console.warn(message)
      this.el.querySelector('.message').textContent = message
      this.el.querySelector('.message').classList.add('enabled')
    })

    LoginState.on('leave invalid', function() {
      this.el.querySelector('.message').textContent = ''
      this.el.querySelector('.message').classList.remove('enabled')
    })

    LoginState.on('enter loading', function() {
      var self = this
      var el = this.state.el = document.createElement('div')
      el.classList.add('spinner')
      var states = ['Thinking.', 'Thinking..', 'Thinking...', 'Thinking']
      this.state.loadingInterval = setInterval(function() {
        el.textContent = states[(states.indexOf(el.textContent) + 1) % states.length]
      }, 300)
      LoginState.el.appendChild(el)
    })

    LoginState.on('leave loading', function() {
      clearInterval(this.state.loadingInterval)
      LoginState.el.removeChild(this.state.el)
    })

    LoginState.on('entering', function() {
      LoginState.goToState('default')
    })

    LoginState.parent.on('enter home', function() {
      done()
    })

    LoginState.on('trigger authenticate', function() {
      LoginState.goToState('loading')
    })

    LoginState.loginError = function() {
      LoginState.goToState('invalid', 'invalid username or password!')
    }
    app.goToState(LoginState)
  })
})

function App() {}

function AJAX(url, data, fn) {
  setTimeout(function() {
    fn(data.username === 'admin' && data.password === 'password')
  }, 300)
}
