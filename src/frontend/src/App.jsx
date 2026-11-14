import { useState } from 'react'
import SearchView from './SearchView.jsx'
import CompareView from './CompareView.jsx'

export default function App() {
  const [view, setView] = useState('search')

  return (
    <>
      <header>
        <span>testing</span>
        <nav>
          <NavButton name="search" view={view} setView={setView}>
            Search
          </NavButton>
          <NavButton name="compare" view={view} setView={setView}>
            Compare Retrievers
          </NavButton>
        </nav>
      </header>

      <main>
        <div hidden={view !== 'search'}>
          <SearchView />
        </div>
        <div hidden={view !== 'compare'}>
          <CompareView />
        </div>
      </main>

      <footer>
        testing 123
      </footer>
    </>
  )
}

function NavButton({ name, view, setView, children }) {
  const active = view === name;
  const look = active ? 'tab-active' : 'text-muted';
  return (
    <button type="button" classname={`tab ${look}`} aria-current={active ? 'page' : undefined} onClick={() => setView(name)}>
      {children}
    </button>
  );
}