import React, { Component } from 'react';
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
          { this.state.loading ? <Loader /> : '' }
          <Home loadingCallback={ this._handleLoading } />
        </header>
      </div>
    );
  }
}
