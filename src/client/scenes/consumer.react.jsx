import React, { Component } from 'react';
import axios from 'axios';
import store from 'store';
import Footer from '../components/footer.react';
import LoadingSpinner from '../components/loadingSpinner.react';
import ConsumerPostList from './consumerPostList.react';
import ConsumerPostItem from './consumerPostItem.react';
import Modal from 'react-responsive-modal';

export default class Consumer extends Component {
  constructor(props) {
    super(props);

    this.state = {
      error: null,
      showModal: false,
      userIsLoaded: false,
      mediaIsLoaded: false,
      user: {},
      data: [],
      currentPost: {},
      localCart: [],
      checkout_request_id: ''
    }

    this.renderUser = this.renderUser.bind(this);
    this.renderPosts = this.renderPosts.bind(this);
    this.renderPostItem = this.renderPostItem.bind(this);
    this.addCurrentPost = this.addCurrentPost.bind(this);
    this.removeCurrentPost = this.removeCurrentPost.bind(this);
    this.currentPostIsEmpty = this.currentPostIsEmpty.bind(this);
    this.addToLocalCart = this.addToLocalCart.bind(this);
    this.buyProducts = this.buyProducts.bind(this);
    this.renderPurchase = this.renderPurchase.bind(this);
    this.handleCloseModal = this.handleCloseModal.bind(this);
  }

  componentDidMount() {
    axios.get(store.get('URL').root_url + `/user${this.props.location.pathname}`)
      .then(
      res => {
        console.log('I NEED TO FIND res.data for user', res.data);
        if (res.data) {
          const newObj = res.data[0];
          // update user state
          this.setState({
            userIsLoaded: true,
            user: newObj
          });
        }
      })
      .catch(err => {
        console.log(err);
      });

    axios.get(store.get('URL').root_url + `${this.props.location.pathname}media`)
      .then(
      res => {
        console.log('I NEED TO FIND res.data for user MEDIA', res);
        if (res.data) {
          const newArr = res.data.map(post => post);
          // update media state
          this.setState({
            mediaIsLoaded: true,
            data: [...newArr]
          });
        }
      })
      .catch(err => {
        console.log(err);
      });
  }

  addCurrentPost(post) {
    console.log('WE ARE ADDING CURRENT POST FROM ROOT', post);
    let currentPost = { ...this.state.currentPost };
    currentPost.instaId = post.instaId;
    currentPost.caption = post.caption;
    currentPost.image_thumb = post.image_thumb;
    currentPost.image_low = post.image_low ? post.image_low : null;
    currentPost.image_norm = post.image_norm ? post.image_norm : null;
    currentPost.video_low = post.video_low ? post.video_low : null;
    currentPost.video_norm = post.video_norm ? post.video_norm : null;
    currentPost.retailLinks = post.retailLinks ? post.retailLinks : null;

    this.setState({ currentPost }, () => console.log('updated state value', this.state.currentPost));
  }

  
  removeCurrentPost() {
    console.log('REMOVING CURRENT POST FROM ROOT');
    this.setState({ currentPost: {} }, () => console.log('UPDATE ON CURRENTPOST', this.state.currentPost))
    this.props.history.goBack();
  }
  
  currentPostIsEmpty() {
    return Object.keys(this.state.currentPost).length === 0 && this.state.currentPost.constructor === Object;
  }
  
  addToLocalCart(item) {
    // might need to use store instead
    this.setState({ localCart: [...this.state.localCart, {url: item}] }, () => console.log('local cart:', this.state.localCart));
  }

  handleCloseModal() {
    this.setState({ showModal: false });
  }

  buyProducts() {
    let checkoutRequest = {};
    checkoutRequest['products'] = this.state.localCart;
    checkoutRequest['public_token'] = '52434d36952f32a3bb43f67ea85c64';
    // checkoutRequest['custom_css_url'] = 'http://localhost:3000/notnicknick/assets/css/integration_twotap.css'
    checkoutRequest['confirm'] = { method: 'sms', sms_confirm_url: 'http://localhost:3000/purchase_confirm_callback' }
    checkoutRequest['unique_token'] = (Math.floor(Math.random() * 9999999) + 1).toString();

    axios.post('https://checkout.twotap.com/prepare_checkout', { checkout_request: checkoutRequest })
      .then(res => {
        console.log('GOT SOMETHING:', res.data);
        this.setState({ showModal: true, checkout_request_id: res.data.checkout_request_id });
      })
      .catch(err => console.log('OOOPPPSS:', err))
  }

  renderPurchase() {
    let customStyles = { 
      width: '100%', 
      height: '100%'
    };
    if (this.state.checkout_request_id) {
      return (
        <div className="iframeContainer">
          <iframe src={`https://checkout.twotap.com/?checkout_request_id=${this.state.checkout_request_id}`} style={customStyles} frameBorder="0" ></iframe>
        </div>
      )
    }
  }

  renderUser() {
    return (
      <div className="user-info">
        <h3>{this.state.user.full_name}</h3>
        <img src={this.state.user.profile_picture} className="img-circle" style={{ 'maxWidth': '15%' }} />
        <br />
      </div>
    )
  }

  renderPosts() {
    return this.state.data.map(post => {
      if (post.videos) {
        return (
          <ConsumerPostList
            key={post._id || post.id}
            username={post.username}
            instaId={post._id || post.id}
            caption={post.caption.text}
            image_thumb={post.images.thumbnail}
            video_low={post.videos.low_bandwidth}
            video_norm={post.videos.standard_resolution}
            retailLinks={post.retailLinks}
            addCurrentPost={this.addCurrentPost}
            {...this.props}
          />
        )
      } else {
        return (
          <ConsumerPostList
            key={post._id || post.id}
            username={post.username}
            instaId={post._id || post.id}
            caption={post.caption.text}
            image_low={post.images.low_resolution}
            image_norm={post.images.standard_resolution}
            image_thumb={post.images.thumbnail}
            retailLinks={post.retailLinks}
            addCurrentPost={this.addCurrentPost}
            {...this.props}
          />
        )
      }
    });
  }

  renderPostItem() {
    console.log('SHOTS FIRED SINGLE POST');
    return (
      <ConsumerPostItem
        currentPost={this.state.currentPost}
        removeCurrentPost={this.removeCurrentPost}
        addToLocalCart={this.addToLocalCart} 
        {...this.props}
      />
    );
  }

  render() {
    return (
      <div id="page-outer">
        <Modal
          open={this.state.showModal}
          onClose={this.handleCloseModal}
          closeOnEsc={true}
          closeOnOverlayClick={true}
          little={false}
          showCloseIcon={true}
        >
          {this.renderPurchase()}
        </Modal>
        <div className="page-container">
          <button className="col-lg-2 col-lg-offset-10 col-md-2 col-md-offset-10 col-sm-3 col-sm-offset-9 col-xs-3 col-xs-offset-9" onClick={this.buyProducts}>
            <span className="glyphicon glyphicon-shopping-cart" aria-hidden="true"></span> Check Cart
          </button>
          {!this.state.userIsLoaded ?
            (<LoadingSpinner />)
            :
            (this.renderUser())
          }
          <br />
          {!this.state.mediaIsLoaded ?
            (<LoadingSpinner />)
            :
            (this.currentPostIsEmpty() ? this.renderPosts() : this.renderPostItem())
          }
        </div>
        <Footer />
      </div>
    )
  }
}