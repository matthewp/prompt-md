The homepage for prompt.md, a web framework where every page is a prompt.

Big headline, a one-line pitch, and three feature cards:
- "Zero code": you write English, not JavaScript.
- "Infinite variety": every page load is a new design.
- "Every URL works": pages that don't exist get made up on the spot.

Link to /about, /blog/hello-world and /guestbook. Make it look like a startup landing page that takes itself far too seriously.

Put a prominent "View on GitHub" link to https://github.com/matthewp/prompt-md in the header and again in the footer.

Below the feature cards, add a "How it works" section with two panels side by side (stacked on narrow screens), both styled like code editor windows.

The left panel shows the project's directory structure, exactly this:

```
my-site/
└── routes/
    ├── index.md
    ├── about.md
    ├── pricing.md
    ├── blog/
    │   └── [slug].md
    └── api/
        └── status.json.md
```

Highlight `index.md` in the tree. The right panel is titled `routes/index.md` and shows that file's contents, exactly this:

```
The homepage for a neighborhood bakery.

Show today's specials, our opening hours,
and a button to order a birthday cake.

Warm and friendly. Lots of whitespace.
```

Under the panels, one line: "That's the whole app. Run `npx prompt.md` and it's live."
