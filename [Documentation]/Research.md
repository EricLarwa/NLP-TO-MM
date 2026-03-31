# Researching ideas

## Graph Model Choices
### Vis.js
- Nodes physically push and pull each other, creating a more organic layout
- Pros: Easy to use, good for small to medium graphs, visually appealing
- Cons: Performance degrades with large graphs, can push CPU and memory limits

### Cytoscape.js
- More efficient rendering, better for larger graphs
- Pros: Handles larger graphs better, more customization options
- Cons: Steeper learning curve, less visually dynamic than vis.js (doesnt look as cool)

### 3D Force Graph
- Uses WebGL for rendering, can handle very large graphs
- Pros: Can visualize very large graphs, visually stunning rendering in 3D space
- Cons: More complex to set up, requires more powerful hardware for smooth performance

### Sigma.js (Recommended)
- Designed for large graph visualization, uses WebGL for performance
- Pros: Good performance with large graphs, customizable, active community
- Cons: Slightly steeper learning curve than vis.js, but worth it for the performance