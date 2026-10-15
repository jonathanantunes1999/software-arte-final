import { mount } from 'svelte';
import './interface/estilos.css';
import App from './interface/App.svelte';

mount(App, { target: document.getElementById('app')! });
