import type { Preview } from '@storybook/nextjs-vite';
import '../app/globals.css';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
       color: /(background|color)$/i,
       date: /Date$/i,
      },
    },

    a11y: {
      test: 'todo'
    },

    backgrounds: {
      default: 'workbench',
      values: [
        { name: 'workbench', value: '#e8e8e8' },
        { name: 'white', value: '#ffffff' },
      ],
    },
  },
};

export default preview;