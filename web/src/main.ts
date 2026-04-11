import { createApp } from 'vue'
import App from './App.vue'
import './style.css'

// 引入 Material Web Components
import '@material/web/button/filled-button.js'
import '@material/web/button/outlined-button.js'
import '@material/web/iconbutton/icon-button.js'
import '@material/web/iconbutton/filled-icon-button.js'
import '@material/web/iconbutton/filled-tonal-icon-button.js'
import '@material/web/textfield/filled-text-field.js'
import '@material/web/textfield/outlined-text-field.js'
import '@material/web/checkbox/checkbox.js'
import '@material/web/select/filled-select.js'
import '@material/web/select/select-option.js'

createApp(App).mount('#app')