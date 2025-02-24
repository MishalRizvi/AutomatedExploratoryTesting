import { WebPageModel } from './types';

export const publicPageModel: WebPageModel = {
  name: 'PublicPage',
  elements: [
    {
      id: 'links',
      htmlId: 'a',        // All <a> tags
      type: 'link',
    },
    {
      id: 'buttons',
      htmlId: 'button',   // All <button> tags
      type: 'button',
    },
    {
      id: 'forms',
      htmlId: 'form',     // All <form> tags
      type: 'form',
    }
  ],
  states: [
    {
      name: 'Initial',
      type: 0,            // Starting state
      elementStates: {
        links: ' ',
        buttons: ' ',
        forms: ' '
      }
    },
    {
      name: 'Explored',
      type: 1,            // End state
      elementStates: {
        links: 'o',
        buttons: 'o',
        forms: 'o'
      }
    }
  ],
  events: [
    {
      name: 'clickLink',
      htmlId: 'a',
      action: 'click',
    },
    {
      name: 'clickButton',
      htmlId: 'button',
      action: 'click',
    }
  ],
  transitions: [
    {
      sourceState: 'Initial',
      targetState: 'Explored',
      event: 'a:click',
    }
  ]
};