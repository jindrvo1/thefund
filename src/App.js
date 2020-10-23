import React, { Component } from 'react';
import { BrowserRouter, Switch, Route } from "react-router-dom";
import './App.css';
import style from './style.module.css';

import Home from './routes/Home';

import Loader from './components/Loader';

export default class App extends Component {
  constructor(props) {
      super(props);
      this.state = {
        loading: true
      }
  }

  _handleLoading = loading => {
    this.setState({ loading });
  }

  render() {
    return (
      <div className="App">
        <header className="App-header">
          <h1 className={ style.loadingHeader }>The Fucking Fund</h1>
          <BrowserRouter>
            <Switch>
              <Route path="/">
                { this.state.loading ? <Loader /> : '' }
                <Home loadingCallback={ this._handleLoading } />
              </Route>
            </Switch>
          </BrowserRouter>
        </header>
      </div>
    );
  }
}
