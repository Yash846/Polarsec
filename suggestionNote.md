Lets Run! has become super popular which while obviously goods news, has surfaced a new problem.
Apparently, people really like running at 6AM, which causes spikes in the requests sent to the /update endpoint, overloading the network and causing slowdowns and unresponsiveness in the application.
How would you solve this issue? Please provide 2 suggestions.

Before suggestions:
as an inital activity for optimization, small tweaks can be made to the code.
Connection pooling for connection to sql db should be used. It should be made async if there is scope.
Check for memory leaks. These would be the first steps

Suggestion 1 :
check and monitor where the bottleneck is. Node or sql. In my experience, node express can handle upwards of 3000 - 5000 queries/second. If it is from db side, we could look for tuning there.
As a starting point optimizing the db by indexing should improve db performance of all queries. Database sharding would be an option as well.
I would want to look into caching, but that doesnt help much with writes through the endpoint. But it will help with other endpoint load reduction and so overall load would be reduces on sb.

Suggestion 2 :
The other solutions after optimizations is looking at resource consumption. If we're at capacity, it would be ideal to scale up our resources.
use ngnix reverse proxy to act as a load balancer between servers. This will help with processing huge volume of requests by adding a server and routing traffic accordingly. If it is a public provider, we can use the autoscaling option as well.
