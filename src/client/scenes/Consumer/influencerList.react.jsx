import axios from 'axios';
import store from 'store';
import React, { Component } from 'react';
import { Link } from 'react-router-dom';
import Footer from '../../components/footer.react';
import LoadingSpinner from '../../components/loadingSpinner.react';
import FourOhFour from '../../components/fourOhFour.react';

export default class InfluencerList extends Component {
  constructor(props) {
    super(props)

    this.state = {
      error: null,
      isLoaded: false,
      influencerLists: []
    };

    this.renderInfluencers = this.renderInfluencers.bind(this);
  }

  componentDidMount() {
    axios.get(store.get('URL').root_url + '/users')
      .then(
        res => {
          if (res.data) {
            console.log('what is my data heah?', res.data);
            let newArr = res.data.map(item => item);
            this.setState({
              influencerLists: newArr,
              isLoaded: true
            });
          }
        }
      )
      .catch(err => {
        console.log(err);
      });
  }

  renderInfluencers() {
    console.log('rending influencers:', this.props);
    return (
      this.state.influencerLists.map(item => {
        return (
          <li key={`index_${item.id}`}>
            <Link to={`/${item.username}`} className="col-lg-10 col-md-12 col-xs-8">
              <img src={item.profile_picture} className="img-circle img-responsive" />
              <p className="lead text-center">{item.username}</p>
            </Link>
          </li>
        )
      })
    )
  }

  render() {
    if (this.state.error) {
      return (<FourOhFour />)
    } else if (!this.state.isLoaded) {
      return (<LoadingSpinner />);
    } else {
      return (
        <div className="container-fluid">
          <div className="row">
            <div className="col-md-3 col-md-offset-5 col-sm-4 col-sm-offset-5 col-xs-offset-2">
              <h2>Our Influencers!</h2>
            </div>
          </div>
          <div className="row">
            <ul className="col-md-2 col-md-offset-2 list-inline">
              {this.renderInfluencers()}
            </ul>
          </div>
        </div>
      )
    }
  }
};
