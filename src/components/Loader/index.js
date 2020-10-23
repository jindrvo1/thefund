import React, { Component } from 'react';
import style from './style.module.css';
import { ClipLoader } from 'react-spinners';

export default class Loader extends Component {
	render() {
		return (
      <div>
        <ClipLoader
          size={ 75 }
          color={ "#61DBFB" }
        />
        <h1 className={ style.loadingHeader }>Fund is loading</h1>
      </div>
    );
	}
}
