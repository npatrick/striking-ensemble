import React, { Component } from 'react';

export default class InputBox extends Component {
  constructor(props) {
    super(props)

    this.removeItem = this.removeItem.bind(this);
  }

  removeItem() {
    this.props.removeRetailLink(this.props.retailIndex);
    this.props.handleChange();
  }

  render() {
    return (
      <div className="row">
        <div className="col-sm-10 col-xs-10">
          <input className="form-control input-sm" type="url" name={`link_${this.props.retailIndex}`} defaultValue={this.props.retailLink} onChange={this.props.handleChange} />
        </div>
        <div className="col-sm-2 col-xs-1">
          <button className="btn btn-warning btn-sm" onClick={this.removeItem} value="retail-form" type="button">-</button>
        </div>
      </div>
    )
  }
};
