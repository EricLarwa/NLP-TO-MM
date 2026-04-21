class GraphVisualizer {
    constructor(containerSelector, knowledgeGraph, options = {}) {
        this.containerSelector = containerSelector;
        this.knowledgeGraph = knowledgeGraph;
        this.options = options;
        this.sigmaInstance = null;
        this.container = null;
        this.graph = null;
        this.isInitialized = false;
    }

    async initialize() {
        this._assertBrowserEnvironment();
        this.isInitialized = false;

        this.container =
            typeof this.containerSelector === 'string'
                ? document.querySelector(this.containerSelector)
                : this.containerSelector;

        if (!this.container) {
            throw new Error('Graph container was not found. Check the selector passed to GraphVisualizer.');
        }

        if (!this.knowledgeGraph || typeof this.knowledgeGraph.getSigmaGraphData !== 'function') {
            throw new Error('GraphVisualizer requires a knowledgeGraph with getSigmaGraphData().');
        }

        const SigmaConstructor = this.options.Sigma || window.Sigma;
        const GraphConstructor =
            this.options.Graph ||
            (window.graphology && window.graphology.Graph) ||
            window.Graph;

        if (!SigmaConstructor || !GraphConstructor) {
            throw new Error('Sigma and Graphology libraries are required before initialize().');
        }

        const { nodes, edges } = this.knowledgeGraph.getSigmaGraphData();
        this.graph = this._buildGraph(GraphConstructor, nodes, edges);

        this.sigmaInstance = this._createSigmaInstance(SigmaConstructor, this.graph);
        this.isInitialized = true;

        return this.sigmaInstance;
    }

    async refresh() {
        if (!this.isInitialized) {
            return this.initialize();
        }

        const SigmaConstructor = this.options.Sigma || window.Sigma;
        const GraphConstructor =
            this.options.Graph ||
            (window.graphology && window.graphology.Graph) ||
            window.Graph;

        const { nodes, edges } = this.knowledgeGraph.getSigmaGraphData();

        if (this.sigmaInstance && typeof this.sigmaInstance.kill === 'function') {
            this.sigmaInstance.kill();
        }

        this.graph = this._buildGraph(GraphConstructor, nodes, edges);
        this.sigmaInstance = this._createSigmaInstance(SigmaConstructor, this.graph);
        this.isInitialized = true;

        return this.sigmaInstance;
    }

    destroy() {
        if (this.sigmaInstance && typeof this.sigmaInstance.kill === 'function') {
            this.sigmaInstance.kill();
        }

        this.sigmaInstance = null;
        this.graph = null;
        this.container = null;
        this.isInitialized = false;
    }

    _assertBrowserEnvironment() {
        if (typeof window === 'undefined' || typeof document === 'undefined') {
            throw new Error('GraphVisualizer can only run in a browser environment.');
        }
    }

    _buildGraph(GraphConstructor, nodes, edges) {
        const graph = new GraphConstructor();

        nodes.forEach((node, index) => {
            const angle = index * 0.7;
            const radius = 4 + index * 0.15;

            graph.addNode(node.key, {
                x: node.x ?? Math.cos(angle) * radius,
                y: node.y ?? Math.sin(angle) * radius,
                label: node.label,
                size: node.size,
                color: node.color,
                ...node.attributes,
            });
        });

        edges.forEach(edge => {
            const sourceExists = graph.hasNode(edge.source);
            const targetExists = graph.hasNode(edge.target);

            if (!sourceExists || !targetExists) {
                return;
            }

            const normalizedAttributes = { ...(edge.attributes || {}) };
            if (normalizedAttributes.type && !normalizedAttributes.semanticType) {
                normalizedAttributes.semanticType = normalizedAttributes.type;
            }
            delete normalizedAttributes.type;

            graph.addEdgeWithKey(edge.key, edge.source, edge.target, {
                label: edge.label,
                size: edge.weight || 1,
                ...normalizedAttributes,
            });
        });

        return graph;
    }

    _createSigmaInstance(SigmaConstructor, graph) {
        const originalAddEventListenerMethod = this.container.addEventListener;
        const originalAddEventListener = originalAddEventListenerMethod.bind(this.container);

        this.container.addEventListener = (type, listener, options) => {
            if (type === 'wheel' && options === undefined) {
                return originalAddEventListener(type, listener, { passive: true });
            }

            if (type === 'wheel' && typeof options === 'boolean') {
                return originalAddEventListener(type, listener, {
                    capture: options,
                    passive: true,
                });
            }

            if (type === 'wheel' && options && typeof options === 'object' && options.passive === undefined) {
                return originalAddEventListener(type, listener, {
                    ...options,
                    passive: true,
                });
            }

            return originalAddEventListener(type, listener, options);
        };

        try {
            return new SigmaConstructor(graph, this.container, {
                renderEdgeLabels: true,
                ...this.options.sigmaSettings,
            });
        } finally {
            this.container.addEventListener = originalAddEventListenerMethod;
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = GraphVisualizer;
}

if (typeof window !== 'undefined') {
    window.GraphVisualizer = GraphVisualizer;
}
