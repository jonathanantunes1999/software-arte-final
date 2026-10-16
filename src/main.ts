import { mount } from 'svelte';
import './interface/estilos.css';
import App from './interface/App.svelte';
import Notch from './interface/Notch.svelte';

// A casca desktop abre uma segunda janela, pequena, para a pílula do "modo notch" (?notch=1)
const ePilula = new URLSearchParams(location.search).has('notch') && !!window.arteFinal?.ehDesktop;

mount(ePilula ? Notch : App, { target: document.getElementById('app')! });
