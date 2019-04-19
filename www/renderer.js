/**
 * Copyright 2019 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const urlBar = document.createElement('input');
urlBar.classList.add('urlbar');
document.body.appendChild(urlBar);

window.urlChanged = function(url) {
  urlBar.value = url;
};

urlBar.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    changeURL(urlBar.value);
    event.preventDefault();
    event.stopPropagation();
  }
});
urlBar.addEventListener('focus', () => urlBar.select());

document.addEventListener('keydown', event => {
  if (document.activeElement.tagName === 'INPUT')
    return;
  if (document.activeElement.tagName === 'TEXTAREA')
    return;
  if (event.key === 'Backspace') {
    if (event.shiftKey)
      goForward();
    else
      goBack();
  }
});

document.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    keypress(event.key);
    event.preventDefault();
    event.stopPropagation();
  }
});

const inner = document.createElement('inner');
let last = null;
async function render() {
  const data = await snapshot();
  if (JSON.stringify(last) === JSON.stringify(data))
    return;
  last = data;
  const lastFocused = {
    id: document.activeElement.nodeId,
    selectionStart: document.activeElement.selectionStart,
    selectionEnd: document.activeElement.selectionEnd,
  };
  inner.textContent = '';
  document.body.appendChild(inner);

  walk(data, inner);

  /**
   * @param {Object} axnode
   * @param {!Element} parentElement
   */
  function walk(axnode, parentElement) {
    let newElement = parentElement;
    switch (axnode.role) {
      case 'WebArea':
        document.title = axnode.name;
        break;
      case 'text':
        newElement = document.createElement('span');
        newElement.textContent = axnode.name;
        parentElement.appendChild(newElement);
        break;
      case 'link':
        newElement = document.createElement('a');
        newElement.href = '#';
        newElement.textContent = axnode.name;
        if (axnode.name.length > 25)
          newElement.className = 'big';
        parentElement.appendChild(newElement);
        break;
      case 'heading':
        newElement = document.createElement('h' + axnode.level);
        newElement.textContent = axnode.name;
        parentElement.appendChild(newElement);
        break;
      case 'button':
        let container = parentElement.lastElementChild;
        if (!container || container.tagName !== 'BUTTON-CONTAINER') {
          container = document.createElement('button-container');
          parentElement.appendChild(container);
        }
        newElement = document.createElement('button');
        newElement.textContent = axnode.name;
        container.appendChild(newElement);
        break;
      case 'radio':
        newElement = document.createElement('input');
        newElement.type = 'radio';
        newElement.textContent = axnode.name;
        newElement.checked = axnode.checked;
        parentElement.appendChild(newElement);
        {
          const label = document.createElement('label');
          label.textContent = axnode.name;
          parentElement.appendChild(label);
        }
        break;
      case 'checkbox':
        newElement = document.createElement('input');
        newElement.type = 'checkbox';
        newElement.textContent = axnode.name;
        newElement.checked = axnode.checked;
        parentElement.appendChild(newElement);
        {
          const label = document.createElement('label');
          label.textContent = axnode.name;
          parentElement.appendChild(label);
        }
        break;
      case 'GenericContainer':
        newElement = document.createElement('div');
        newElement.textContent = axnode.name;
        newElement.tabIndex = 0;
        parentElement.appendChild(newElement);
        break;
      case 'ListMarker':
        newElement = document.createElement('span');
        newElement.textContent = axnode.name;
        newElement.className = 'list-marker';
        parentElement.appendChild(newElement);
        break;
      case 'img':
        newElement = document.createElement('ax-image');
        newElement.textContent = axnode.name;
        newElement.title = axnode.title;
        parentElement.appendChild(newElement);
        break;
      case 'listbox':
      case 'combobox':
        if (!axnode.editable) {
          if (!axnode.children || !axnode.children.some(x => x.role === 'menuitem' || x.role === 'option')) {
            newElement = document.createElement('button');
            newElement.textContent = axnode.name;
            newElement.className = 'dropdown';
            parentElement.appendChild(newElement);
          } else {
            newElement = document.createElement('select');
            newElement.title = axnode.name;
            for (const child of axnode.children) {
              if (child.role === 'menuitem' || child.role === 'option') {
                const option = document.createElement('option');
                option.textContent = child.name;
                newElement.appendChild(option);
              }
            }
            newElement.value = axnode.value;
            parentElement.appendChild(newElement);
          }
          break;
        }
        // fallthrough
      case 'textbox':
        newElement = document.createElement(axnode.multiline ? 'textarea' : 'input');
        newElement.type = 'text';
        newElement.value = axnode.value || '';
        newElement.title = newElement.placeholder = axnode.name;
        newElement.disabled = axnode.disabled;
        parentElement.appendChild(newElement);
        break;
      case 'menu':
        newElement = document.createElement('menu');
        const h2 = document.createElement('h2');
        h2.textContent = axnode.name;
        newElement.appendChild(h2);
        parentElement.appendChild(newElement);
        break;
      case 'menuitem':
        newElement = document.createElement('li');
        if (!axnode.children)
          newElement.textContent = axnode.name;
        newElement.title = axnode.name;
        parentElement.appendChild(newElement);
        break;

      case 'tab':
        newElement = document.createElement('tab');
        if (!axnode.children)
          newElement.textContent = axnode.name;
        axnode.title = axnode.name;
        parentElement.appendChild(newElement);
        break;

      default:
        newElement = document.createElement('div');
        newElement.textContent = `${axnode.role}: ${axnode.name}`;
        parentElement.appendChild(newElement);
    }
    newElement.nodeId = axnode.nodeId;
    newElement.addEventListener('click', async event => {
      event.stopPropagation();
      await evalWithNode(axnode, node => node.click && node.click());
      await render();
    });
    newElement.addEventListener('focus', async event => {
      await evalWithNode(axnode, node => node.focus && node.focus());
    });
    newElement.addEventListener('input', event => {
      evalWithNode(axnode, (node, value) => node.value = value, newElement.value);
      event.stopPropagation();
    });
    if (axnode.nodeId === lastFocused.id) {
      newElement.focus();
      newElement.selectionStart = lastFocused.selectionStart;
      newElement.selectionEnd = lastFocused.selectionEnd;
    }
    for (const child of axnode.children || [])
      walk(child, newElement);
  }
}

setInterval(render, 1500);

async function evalWithNode(node, func, ...args) {
  return await $eval(node.backendDOMNodeId, func.toString(), ...args);
}