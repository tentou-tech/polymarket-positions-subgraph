# positions-subgraph

```bash
docker compose up
```

## Restart graph node and clear volumes:

```bash
docker compose down
```

```bash
sudo docker rm positions-subgraph_graph-node_1 && sudo docker rm positions-subgraph_ipfs_1 && sudo docker rm positions-subgraph_postgres_1 && sudo docker rm positions-subgraph_ganache_1
```

## Create and deploy subgraph

While local subgraph node is running run:

```bash
yarn create-local
```

```bash
yarn deploy-local
```

Access the GraphQL editor at:

[`http://localhost:8000/subgraphs/name/positions-subgraph/graphql`](http://localhost:8000/subgraphs/name/positions-subgraph/graphql)

**Example query:**

```graphQL
query tokenIdConditions {
  tokenIdConditions {
    id
    condition
    complement
  }
}
```