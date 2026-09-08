# Save Management

V1 supports:

- full world export
- full world import
- individual player export
- individual player import

Imports must:

1. stage uploads outside live save directories
2. validate package type and archive structure
3. reject path traversal
4. enforce file and expanded-size limits
5. validate expected Palworld save paths
6. create a pre-import backup
7. stop or quiesce Palworld when required
8. apply changes safely
9. record the operation
10. support recovery when an import fails
