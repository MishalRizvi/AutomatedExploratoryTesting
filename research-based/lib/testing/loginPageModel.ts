import { WebPageModel } from '@/lib/testing/types';

export const loginPageModel: WebPageModel = {
  name: 'LoginPage',
  elements: [
    {
      id: '1',
      htmlId: 'username',
      type: 'textbox',
      value1: 'testuser',
    },
    {
      id: '2',
      htmlId: 'password',
      type: 'textbox',
      value1: 'password123',
    },
    {
      id: '3',
      htmlId: 'loginButton',
      type: 'button',
    },
  ],
  states: [
    {
      name: 'Initial',
      type: 0,
      elementStates: {
        username: ' ',
        password: ' ',
        loginButton: ' ',
      },
    },
    {
      name: 'FilledForm',
      type: 5,
      elementStates: {
        username: 'o',
        password: 'o',
        loginButton: ' ',
      },
    },
    {
      name: 'LoggedIn',
      type: 1,
      elementStates: {
        username: 'o',
        password: 'o',
        loginButton: 'o',
      },
    },
  ],
  events: [
    {
      name: 'enterUsername',
      htmlId: 'username',
      action: 'addtext',
    },
    {
      name: 'enterPassword',
      htmlId: 'password',
      action: 'addtext',
    },
    {
      name: 'clickLogin',
      htmlId: 'loginButton',
      action: 'click',
    },
  ],
  transitions: [
    {
      sourceState: 'Initial',
      targetState: 'FilledForm',
      event: 'username:addtext',
      guard: 'testuser',
    },
    {
      sourceState: 'FilledForm',
      targetState: 'LoggedIn',
      event: 'loginButton:click',
    },
  ],
};