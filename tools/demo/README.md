# Historical demo data

A selected Darwin–Wedgwood family tree: 21 people, 31 parent-child relationships,
five generations. Profiles are historical people, never application accounts.
Only one sourced exact birth date is included; absent life dates mean unknown
in this selected dataset and do not assert that anyone is living today.
No spouse edges are invented because the application has no spouse relationship.
The two cousin branches converge at Charles and Emma's children.

Sources:

- [Cambridge: About Darwin](https://www.darwinproject.ac.uk/about-darwin)
- [Cambridge: Emma Darwin](https://www.darwinproject.ac.uk/emma-darwin)
- [English Heritage: the Darwin family at Down House](https://www.english-heritage.org.uk/visit/places/home-of-charles-darwin-down-house/history/darwin-family/)

Run `tools/seed-darwin-demo.mjs` only for an explicitly requested demo. It creates
and changes only its private demo account's family through application APIs.
The local ignored credentials file is the operator's access to the demo.
