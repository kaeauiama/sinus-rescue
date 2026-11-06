import { render } from 'preact';
import { App } from './shell/App';
import './styles.css';

render(<App />, document.getElementById('app') as HTMLElement);
