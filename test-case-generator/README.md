This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.



This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.



Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

# 📦 Architecture Overview

The core of this application is the Intelligence class, which is responsible for:

- Crawling and interacting with pages
- Extracting interactive elements
- Building and expanding a directed graph of flows
- Caching, cycle detection, and depth limiting

## 🧠 Core Functionalities & Logic

### 🔄 expandTree

The expandTree function is the main recursive crawler.

- Starts with a root URL node
- Extracts all interactive elements on the page
- Interacts with each element and observes changes
- If a new URL appears, it recurses into that page
- Builds a directed graph with URLs and interactions as nodes

It includes:
- Cycle detection using currentPath
- Depth limiting via MAX_DEPTH
- Element reuse prevention via visitedElements

### 🧭 Navigation & URL Handling

**shouldSkipUrl(url)**

Skips URLs that are:
- Empty, #, or javascript:
- Auth-related: /login, /signup, etc.
- Media/downloads: .pdf, .jpg, .zip, etc.
- External domains

**normalizeUrl(url)**

Normalizes URLs to:
- Remove trailing slashes and fragments
- Standardize protocol
- Sort query parameters for consistency

**getNavigationUrl(href, base)**

Resolves href into a full navigable URL, handles:
- Relative/absolute paths
- External domain filtering

### 🔍 extractInteractiveElements(url, page?)

Responsible for extracting all actionable elements from the page:

- Uses Playwright to query common nav elements (e.g., nav a, header a)
- Uses CDP to get the full DOM tree (DOM.getDocument)
- Recursively traverses DOM nodes
- Uses DOMDebugger.getEventListeners to detect elements with supported event types:
  - click, submit, input, change, etc.
- If parent node has an event listener, we continue traversing its children to find the most granular element with an event listener. If this is not found, the closest ancestor with an event listener is chosen as the interactive element. This is to ensure we are selecting the most specific element for the interaction.
- Applies accessibility checks using Accessibility.getAXNodeAndAncestors to retrieve role of the element if not specified already, which is useful for Playwright interactions.
- Filters out ignorable nodes via shouldSkipNode() and shouldSkipElement()

All detected interactive elements are:
- Given a unique elementId
- Cached per normalized URL
- Stored in a map: Map<string, Map<string, InteractiveElementGeneric>>

### 🔎 Interactive Element Criteria

Element is considered interactive if:
- It has supported event listeners and
- It's a valid interactive tag: a, button, input, form, select, etc.
- OR a div with cursor-pointer

### ✨ Form Analysis

Forms are treated as composite interactive elements:
- Extracts all input/select/textarea fields
- Gathers submit buttons
- Builds an interaction chain (sequence of input + submit steps)
- Validates required fields

### 🎮 Interaction Engine

**performFullInteraction(page, element)**

Performs an automated interaction using Playwright:
- Tries to locate the element via:
  - Role + name
  - Exact text
  - ID
  - Partial text
  - Common fallback selectors
- Executes the appropriate action:
  - click for links and buttons
  - fill for inputs
  - select for dropdowns
  - Form interaction for form types
  - Search field support via Enter key

**handleClickInteraction, handleInputInteraction, etc.**

Each type of element has a custom handler that:
- Tries multiple methods (standard click, force, JS, parent)
- Waits for page stability post interaction

**waitForStability(page)**

Ensures the DOM is settled after an action:
- Waits for networkidle
- Waits for absence of DOM mutations/animations

### 🧰 Graph Construction

Uses typescript-graph to create a DirectedGraph<WebComponent>
- Nodes: URLs and interactive elements (both extend WebComponent)
- Edges: Transitions from one element to another or from a URL to an element
- addEdgeWithTracking() keeps a Map<string, string[]> for efficient DFS

**findAllPathsInGraph()**
- Performs depth-first search to extract all reachable user flows from any node
- The output is a list of unique paths taken in the graph, starting from the root node, representing all possible user flows. 

## 🧪 Robust Features

- **Cycle Detection**: Prevents infinite recursion via path tracking
- **Depth Limiting**: Halts traversal beyond a safe max depth (default: 10)
- **Graceful Shutdown**: On Ctrl+C:
  - Logs graph
  - Outputs all discovered user flows
  - Cleanly exits

## 🧾 Logging & Debugging

Extensive console logs for every major action:
- Page navigation
- Element interaction attempts
- Element filtering/skipping
- Graph insertion

Helpful emojis and section markers make debugging easy and visual.

## 🧱 Stack

- **Next.js** — React framework
- **Playwright** — Browser automation
- **CDP** — Low-level DOM access
- **TypeScript** — Strong typing
- **typescript-graph** — Directed graph modeling

## 📎 Summary

This project is a powerful tool to introspect, map, and interact with web applications through automation. It combines deep DOM traversal, smart filtering, accessibility analysis, and robust interaction strategies to create a navigable model of your web app's UX.

Ideal for researchers, testers, and automation engineers who want to map out complex flows automatically.